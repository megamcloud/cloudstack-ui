import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material';
import { Router } from '@angular/router';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Action, select, Store } from '@ngrx/store';
import { Observable, of } from 'rxjs';
import {
  catchError,
  filter,
  map,
  mergeMap,
  onErrorResumeNext,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import { SnackBarService } from '../../../core/services';
import { DialogService } from '../../../dialog/dialog-service/dialog.service';
// tslint:disable-next-line
import { VolumeAttachmentContainerComponent } from '../../../shared/actions/volume-actions/volume-attachment/volume-attachment.container';
// tslint:disable-next-line
import { VolumeDeleteDialogComponent } from '../../../shared/actions/volume-actions/volume-delete/volume-delete-dialog.component';
import { VolumeResizeContainerComponent } from '../../../shared/actions/volume-actions/volume-resize.container';
import { NgrxEntities } from '../../../shared/interfaces';
import { DiskOffering, isRoot, Volume } from '../../../shared/models';
import { isCustomized } from '../../../shared/models/offering.model';
import { JobsNotificationService } from '../../../shared/services/jobs-notification.service';
import { VolumeTagService } from '../../../shared/services/tags/volume-tag.service';
import { VolumeResizeData, VolumeService } from '../../../shared/services/volume.service';
// tslint:disable-next-line
import { RecurringSnapshotsComponent } from '../../../snapshot/recurring-snapshots/recurring-snapshots.component';
import * as fromDiskOfferings from '../../disk-offerings/redux/disk-offerings.reducers';
import { State } from '../../index';
import * as snapshotActions from '../../snapshots/redux/snapshot.actions';
import * as volumeActions from './volumes.actions';
import * as fromVolumes from './volumes.reducers';

const pickBy = require('lodash/pickBy');

@Injectable()
export class VolumesEffects {
  @Effect()
  loadVolumes$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.LOAD_VOLUMES_REQUEST),
    switchMap((action: volumeActions.LoadVolumesRequest) => {
      return this.volumeService.getList(action.payload).pipe(
        map((volumes: Volume[]) => {
          return new volumeActions.LoadVolumesResponse(volumes);
        }),
        catchError(() => of(new volumeActions.LoadVolumesResponse([]))),
      );
    }),
  );

  @Effect()
  createVolume$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.CREATE_VOLUME),
    mergeMap((action: volumeActions.CreateVolume) => {
      const notificationId = this.jobsNotificationService.add(
        'NOTIFICATIONS.VOLUME.CREATION_IN_PROGRESS',
      );
      return this.volumeService.create(action.payload).pipe(
        tap(() => {
          const message = 'NOTIFICATIONS.VOLUME.CREATION_DONE';
          this.showNotificationsOnFinish(message, notificationId);
        }),
        map(createdVolume => {
          this.dialog.closeAll();
          return new volumeActions.CreateSuccess(createdVolume);
        }),
        catchError((error: Error) => {
          const message = 'NOTIFICATIONS.VOLUME.CREATION_FAILED';
          this.dialogService.showNotificationsOnFail(error, message, notificationId);
          return of(new volumeActions.CreateError(error));
        }),
      );
    }),
  );
  @Effect()
  createVolumeFromSnapshot$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.CREATE_VOLUME_FROM_SNAPSHOT),
    mergeMap((action: volumeActions.CreateVolumeFromSnapshot) => {
      const notificationId = this.jobsNotificationService.add(
        'NOTIFICATIONS.VOLUME.CREATION_IN_PROGRESS',
      );
      return this.volumeService.createFromSnapshot(action.payload).pipe(
        tap(() => {
          const message = 'NOTIFICATIONS.VOLUME.CREATION_DONE';
          this.showNotificationsOnFinish(message, notificationId);
        }),
        map((volume: Volume) => {
          this.dialog.closeAll();
          return new volumeActions.CreateVolumeFromSnapshotSuccess(volume);
        }),
        catchError((error: Error) => {
          const message = 'NOTIFICATIONS.VOLUME.CREATION_FAILED';
          this.dialogService.showNotificationsOnFail(error, message, notificationId);
          return of(new volumeActions.CreateError(error));
        }),
      );
    }),
  );

  @Effect()
  changeDescription$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.VOLUME_CHANGE_DESCRIPTION),
    mergeMap((action: volumeActions.ChangeDescription) => {
      const notificationId = this.jobsNotificationService.add(
        'NOTIFICATIONS.VOLUME.CHANGE_DESCRIPTION_IN_PROGRESS',
      );

      return (action.payload.description
        ? this.volumeTagService.setDescription(action.payload.volume, action.payload.description)
        : this.volumeTagService.removeDescription(action.payload.volume)
      ).pipe(
        map((volume: Volume) => {
          const message = 'NOTIFICATIONS.VOLUME.CHANGE_DESCRIPTION_DONE';
          this.showNotificationsOnFinish(message, notificationId);
          return new volumeActions.UpdateVolume(volume);
        }),
        catchError((error: Error) => {
          const message = 'NOTIFICATIONS.VOLUME.CHANGE_DESCRIPTION_FAILED';
          this.dialogService.showNotificationsOnFail(error, message, notificationId);
          return of(new volumeActions.VolumeUpdateError(error));
        }),
      );
    }),
  );

  @Effect()
  attachVolume$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.ATTACH_VOLUME),
    mergeMap((action: volumeActions.AttachVolume) => {
      return this.dialog
        .open(VolumeAttachmentContainerComponent, {
          data: {
            volume: action.payload,
            zoneId: action.payload.zoneid,
          },
          width: '375px',
        })
        .afterClosed()
        .pipe(
          filter(Boolean),
          switchMap(virtualMachineId => {
            const notificationId = this.jobsNotificationService.add(
              'NOTIFICATIONS.VOLUME.ATTACHMENT_IN_PROGRESS',
            );

            const params = {
              virtualMachineId,
              id: action.payload.id,
            };
            return this.volumeService.attach(params).pipe(
              map((volume: Volume) => {
                const message = 'NOTIFICATIONS.VOLUME.ATTACHMENT_DONE';
                this.showNotificationsOnFinish(message, notificationId);
                return new volumeActions.UpdateVolume(volume);
              }),
              catchError((error: Error) => {
                const message = 'NOTIFICATIONS.VOLUME.ATTACHMENT_FAILED';
                this.dialogService.showNotificationsOnFail(error, message, notificationId);
                return of(new volumeActions.VolumeUpdateError(error));
              }),
            );
          }),
        );
    }),
  );

  @Effect()
  attachVolumeToVM$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.ATTACH_VOLUME_TO_VM),
    mergeMap((action: volumeActions.AttachVolumeToVM) => {
      const notificationId = this.jobsNotificationService.add(
        'NOTIFICATIONS.VOLUME.ATTACHMENT_IN_PROGRESS',
      );

      const params = {
        id: action.payload.volumeId,
        virtualMachineId: action.payload.virtualMachineId,
      };
      return this.volumeService.attach(params).pipe(
        map((volume: Volume) => {
          const message = 'NOTIFICATIONS.VOLUME.ATTACHMENT_DONE';
          this.showNotificationsOnFinish(message, notificationId);
          return new volumeActions.UpdateVolume(volume);
        }),
        catchError((error: Error) => {
          const message = 'NOTIFICATIONS.VOLUME.ATTACHMENT_FAILED';
          this.dialogService.showNotificationsOnFail(error, message, notificationId);
          return of(new volumeActions.VolumeUpdateError(error));
        }),
      );
    }),
  );

  @Effect()
  detachVolume$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.DETACH_VOLUME),
    mergeMap((action: volumeActions.DetachVolume) => {
      return this.dialogService
        .confirm({ message: 'DIALOG_MESSAGES.VOLUME.CONFIRM_DETACHMENT' })
        .pipe(
          onErrorResumeNext(),
          filter(Boolean),
          switchMap(() => {
            const notificationId = this.jobsNotificationService.add(
              'NOTIFICATIONS.VOLUME.DETACHMENT_IN_PROGRESS',
            );
            return this.volumeService.detach(action.payload).pipe(
              switchMap((volume: Volume) => {
                const message = 'NOTIFICATIONS.VOLUME.DETACHMENT_DONE';
                this.showNotificationsOnFinish(message, notificationId);
                return of(new volumeActions.ReplaceVolume(volume));
              }),
              catchError((error: Error) => {
                const message = 'NOTIFICATIONS.VOLUME.DETACHMENT_FAILED';
                this.dialogService.showNotificationsOnFail(error, message, notificationId);
                return of(new volumeActions.VolumeUpdateError(error));
              }),
            );
          }),
        );
    }),
  );

  @Effect()
  resizeVolume$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.RESIZE_VOLUME),
    withLatestFrom(this.store.pipe(select(fromDiskOfferings.selectEntities))),
    switchMap(
      ([action, diskOfferings]: [volumeActions.ResizeVolume, NgrxEntities<DiskOffering>]) => {
        const volume = action.payload;
        return this.dialog
          .open(VolumeResizeContainerComponent, {
            data: { volume },
            width: '375px',
          })
          .afterClosed()
          .pipe(
            filter(Boolean),
            switchMap((params: VolumeResizeData) => {
              const notificationId = this.jobsNotificationService.add(
                'NOTIFICATIONS.VOLUME.RESIZE_IN_PROGRESS',
              );

              const selectedDiskOffering = diskOfferings[params.diskofferingid];
              const needSize = isCustomized(selectedDiskOffering) || isRoot(volume);

              const requestParams: VolumeResizeData = pickBy(
                {
                  id: params.id,
                  size: needSize ? params.size : null,
                  diskofferingid: (!isRoot(volume) && params.diskofferingid) || null,
                },
                value => value != null,
              );

              return this.volumeService.resize(requestParams).pipe(
                map((changedVolume: Volume) => {
                  const message = 'NOTIFICATIONS.VOLUME.RESIZE_DONE';
                  this.showNotificationsOnFinish(message, notificationId);
                  this.dialog.closeAll();
                  return new volumeActions.ResizeVolumeSuccess(changedVolume);
                }),
                catchError((error: Error) => {
                  const message = 'NOTIFICATIONS.VOLUME.RESIZE_FAILED';
                  this.dialogService.showNotificationsOnFail(error, message, notificationId);
                  return of(new volumeActions.VolumeUpdateError(error));
                }),
              );
            }),
          );
      },
    ),
  );

  @Effect({ dispatch: false })
  addSnapshotSchedule$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.ADD_SNAPSHOT_SCHEDULE),
    mergeMap((action: volumeActions.AddSnapshotSchedule) => {
      return this.dialog
        .open(RecurringSnapshotsComponent, {
          data: action.payload,
        })
        .afterClosed();
    }),
  );

  @Effect()
  deleteVolumes$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.DELETE_VOLUMES),
    withLatestFrom(this.store.pipe(select(fromVolumes.selectVolumesWithSnapshots))),
    map(([action, volumes]: [volumeActions.DeleteVolumes, Volume[]]) => {
      return [
        volumes.filter(
          (volume: Volume) => !isRoot(volume) && volume.virtualmachineid === action.payload.vm.id,
        ),
        action.payload.expunged,
      ];
    }),
    filter(([volumes]: [Volume[], boolean]) => !!volumes.length),
    switchMap(([volumes, expunged]: [Volume[], boolean]) =>
      this.dialog
        .open(VolumeDeleteDialogComponent, {
          data: !!volumes.find(volume => volume.snapshots && !!volume.snapshots.length),
        })
        .afterClosed()
        .pipe(
          filter(Boolean),
          mergeMap(params => {
            return volumes.reduce((res: Action[], volume: Volume) => {
              if (params.deleteSnapshots && !!volume.snapshots.length) {
                res.push(new snapshotActions.DeleteSnapshots(volume.snapshots));
              }
              res.push(
                new volumeActions.DeleteVolume({
                  ...volume,
                  virtualmachineid: expunged ? null : volume.virtualmachineid,
                  snapshots: [],
                }),
              );
              return res;
            }, []);
          }),
        ),
    ),
  );

  @Effect()
  deleteVolume$: Observable<Action> = this.actions$.pipe(
    ofType(volumeActions.DELETE_VOLUME),
    mergeMap((action: volumeActions.DeleteVolume) => {
      const notificationId = this.jobsNotificationService.add(
        'NOTIFICATIONS.VOLUME.DELETION_IN_PROGRESS',
      );

      const remove = removeVolume => {
        return this.volumeService.remove(removeVolume).pipe(
          map(() => {
            const message = 'NOTIFICATIONS.VOLUME.DELETION_DONE';
            this.showNotificationsOnFinish(message, notificationId);
            if (removeVolume.snapshots && !!removeVolume.snapshots.length) {
              this.dialogService
                .confirm({ message: 'DIALOG_MESSAGES.SNAPSHOT.CONFIRM_ALL_DELETION' })
                .pipe(
                  onErrorResumeNext(),
                  filter(Boolean),
                )
                .subscribe(() =>
                  this.store.dispatch(new snapshotActions.DeleteSnapshots(removeVolume.snapshots)),
                );
            }
            return new volumeActions.DeleteSuccess(removeVolume);
          }),
          catchError((error: Error) => {
            const message = 'NOTIFICATIONS.VOLUME.DELETION_FAILED';
            this.dialogService.showNotificationsOnFail(error, message, notificationId);
            return of(new volumeActions.VolumeUpdateError(error));
          }),
        );
      };

      const detach = detachVolume => {
        return this.volumeService.detach(detachVolume).pipe(
          map((volume: Volume) => {
            return new volumeActions.ReplaceVolume(volume);
          }),
          catchError((error: Error) => {
            const message = 'NOTIFICATIONS.VOLUME.DETACHMENT_FAILED';
            const detachError = 'ERRORS.VOLUME.VOLUME_DELETING_UNAVAILABLE';
            this.dialogService.showNotificationsOnFail(
              { message: detachError },
              message,
              notificationId,
            );
            return of(new volumeActions.VolumeUpdateError(error));
          }),
        );
      };

      if (action.payload.virtualmachineid) {
        return detach(action.payload).pipe(
          filter((a: Action) => a.type === volumeActions.REPLACE_VOLUME),
          mergeMap(() => remove(action.payload)),
        );
      }
      return remove(action.payload);
    }),
  );

  @Effect({ dispatch: false })
  deleteVolumeSuccessNavigate$: Observable<Volume> = this.actions$.pipe(
    ofType(volumeActions.VOLUME_DELETE_SUCCESS),
    map((action: volumeActions.DeleteSuccess) => action.payload),
    filter((volume: Volume) => {
      return this.router.isActive(`/storage/${volume.id}`, false);
    }),
    tap(() => {
      this.router.navigate(['./storage'], {
        queryParamsHandling: 'preserve',
      });
    }),
  );

  constructor(
    private actions$: Actions,
    private dialogService: DialogService,
    private volumeService: VolumeService,
    private volumeTagService: VolumeTagService,
    private router: Router,
    private snackBarService: SnackBarService,
    private jobsNotificationService: JobsNotificationService,
    private dialog: MatDialog,
    private store: Store<State>,
  ) {}

  private showNotificationsOnFinish(message: string, jobNotificationId?: string) {
    if (jobNotificationId) {
      this.jobsNotificationService.finish({
        message,
        id: jobNotificationId,
      });
    }
    this.snackBarService.open(message).subscribe();
  }
}
