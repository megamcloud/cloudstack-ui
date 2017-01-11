import { Component, OnInit } from '@angular/core';
import { ResourceUsageService, ResourceStats } from '../shared/services/resource-usage.service';


@Component({
  selector: 'cs-vm-statistics',
  templateUrl: './vm-statistics.component.html',
  styleUrls: ['./vm-statistics.component.scss']
})
export class VmStatisticsComponent implements OnInit {

  public resourceUsage: ResourceStats;

  constructor(private resourceUsageService: ResourceUsageService) {
    this.resourceUsage = new ResourceStats();
  }

  public ngOnInit() {
    this.updateStats();
  }

  public updateStats(): void {
    this.resourceUsageService.getResourceUsage().then(result => {
      this.resourceUsage = result;
      console.log(result);
    });
  }
}
