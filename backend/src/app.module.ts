import { Module } from "@nestjs/common";
import { CoreModule } from "./common/core.module";
import { AdminProfessionalsController, AdminServicesController, AdminTimeOffController } from "./modules/admin-catalog.controller";
import { AdminAppointmentsController, AdminClientsController } from "./modules/admin-agenda.controller";
import { AppointmentsController } from "./modules/appointments.controller";
import { AuthController } from "./modules/auth.controller";
import { CatalogController } from "./modules/catalog.controller";
import { CompanyController } from "./modules/company.controller";
import { PlatformController } from "./modules/platform.controller";
import { ReportsController } from "./modules/reports.controller";

@Module({
  imports: [CoreModule],
  controllers: [
    AuthController, CatalogController, AppointmentsController, CompanyController,
    AdminServicesController, AdminProfessionalsController, AdminTimeOffController, AdminAppointmentsController, AdminClientsController,
    PlatformController, ReportsController,
  ],
})
export class AppModule {}
