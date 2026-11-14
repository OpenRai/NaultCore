import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { RemoteSigningComponent } from './remote-signing.component';
import { RemoteSignService } from '../../services/remote-sign.service';

@NgModule({
  declarations: [RemoteSigningComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild([{ path: '', component: RemoteSigningComponent }]),
  ],
  providers: [RemoteSignService],
})
export class RemoteSigningModule {}
