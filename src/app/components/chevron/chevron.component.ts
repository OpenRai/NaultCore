import { Component, Input } from '@angular/core';
@Component({ standalone: true, selector: 'app-chevron', templateUrl: './chevron.component.html', styleUrl: './chevron.component.css' })
export class ChevronComponent {
  @Input() expanded = false;
}
