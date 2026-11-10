import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AllExceptionsFilter } from "./api-error";
import { AppointmentsService } from "./appointments.service";
import { AuditService } from "./audit.service";
import { AuthGuard } from "./auth";
import { MailService } from "./mail.service";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";

@Global()
@Module({
  providers: [
    PrismaService, AuditService, MailService, StorageService, AppointmentsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [PrismaService, AuditService, MailService, StorageService, AppointmentsService],
})
export class CoreModule {}
