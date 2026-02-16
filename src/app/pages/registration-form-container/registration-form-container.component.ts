import { Component } from '@angular/core';

@Component({
  selector: 'app-registration-form-container',
  templateUrl: './registration-form-container.component.html',
  styleUrl: './registration-form-container.component.scss'
})
export class RegistrationFormContainerComponent {

  constructor() {}

  /**
   * Handles the registration form submission
   * @param event Optional submission event to prevent default behavior
   */
  onSubmit(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    
    console.log('Registration submission triggered');
    // Implementation for form validation and API call would go here
  }

}