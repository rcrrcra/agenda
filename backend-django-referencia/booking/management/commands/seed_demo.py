"""Comando `python manage.py seed_demo`: dados de exemplo para testar o sistema."""
import random
from datetime import datetime, time, timedelta
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from booking.models import (Appointment, Break, Company, CompanyMember, Professional,
                            ProfessionalService, Service, WorkingHours)


class Command(BaseCommand):
    """Cria duas empresas (barbearia e clínica) com serviços, profissionais, horários e pausas distintos."""

    help = "Cria empresas, profissionais e serviços de exemplo"

    def add_arguments(self, parser):
        """Opção `--owner`: e-mail de um usuário existente que passa a administrar as empresas de exemplo."""
        parser.add_argument("--owner", help="E-mail de um usuário já cadastrado para administrar os exemplos.")
        parser.add_argument("--history", action="store_true",
                            help="Cria ~90 dias de atendimentos passados (concluídos, faltas, cancelados) para testar os relatórios.")

    def handle(self, *args, **options):
        """Cria os dados só se ainda não houver empresas (seguro para rodar de novo)."""
        if Company.objects.exists():
            return self.stdout.write("Já existem empresas; nada a fazer.")

        barbearia = Company.objects.create(name="Barbearia Exemplo", category="Barbearia", city="Campinas", address="Rua das Flores, 100")
        corte = Service.objects.create(company=barbearia, name="Corte de cabelo")
        barba = Service.objects.create(company=barbearia, name="Barba")
        ana = Professional.objects.create(company=barbearia, name="Ana Souza", bio="Cabeleireira", slot_minutes=30, buffer_minutes=10)
        ProfessionalService.objects.create(professional=ana, service=corte, duration_minutes=45, price=60)
        ProfessionalService.objects.create(professional=ana, service=barba, duration_minutes=30, price=40)
        for d in range(5):
            WorkingHours.objects.create(professional=ana, weekday=d, start_time=time(9), end_time=time(18))
            Break.objects.create(professional=ana, weekday=d, start_time=time(12), end_time=time(13), label="Almoço")

        clinica = Company.objects.create(name="Clínica Exemplo", category="Clínica", city="São Paulo", address="Av. Central, 500")
        cons = Service.objects.create(company=clinica, name="Consulta")
        ret = Service.objects.create(company=clinica, name="Retorno")
        carlos = Professional.objects.create(company=clinica, name="Dr. Carlos Lima", bio="Clínico geral", slot_minutes=60, buffer_minutes=0)
        ProfessionalService.objects.create(professional=carlos, service=cons, duration_minutes=60, price=200)
        ProfessionalService.objects.create(professional=carlos, service=ret, duration_minutes=30, price=100, slot_minutes=30)  # intervalo próprio do serviço
        for d in (0, 2, 4):
            # sexta com intervalo próprio de 30 min (as outras usam o do serviço ou o padrão de 60)
            WorkingHours.objects.create(professional=carlos, weekday=d, start_time=time(14), end_time=time(19),
                                        slot_minutes=30 if d == 4 else None)
        for d in (1, 3):
            WorkingHours.objects.create(professional=carlos, weekday=d, start_time=time(8), end_time=time(12))
        Break.objects.create(professional=carlos, weekday=2, start_time=time(16), end_time=time(16, 30), label="Lanche")

        self.stdout.write("Empresas de exemplo criadas.")
        if options.get("history"):
            self._make_history([(ana, [corte, barba]), (carlos, [cons, ret])])
        email = (options.get("owner") or "").lower()
        if email:
            user = get_user_model().objects.filter(username=email).first()
            if user:
                for company in (barbearia, clinica):
                    CompanyMember.objects.get_or_create(company=company, user=user)
                self.stdout.write(f"{email} agora administra as duas empresas.")
            else:
                self.stdout.write(f"Usuário {email} não encontrado: cadastre-se no app e rode de novo ou use /admin/.")

    def _make_history(self, pairs):
        """Gera atendimentos passados de um cliente de exemplo, com situações variadas (sempre os mesmos: seed fixa)."""
        rng = random.Random(42)
        customer, _ = get_user_model().objects.get_or_create(
            username="cliente.demo@example.com", defaults={"email": "cliente.demo@example.com", "first_name": "Cliente Demo"})
        customer.set_unusable_password()
        customer.save()
        today, tz, n = timezone.localdate(), timezone.get_current_timezone(), 0
        for back in range(1, 91):
            day = today - timedelta(days=back)
            for pro, services in pairs:
                if not pro.working_hours.filter(weekday=day.weekday()).exists():
                    continue
                for hour in rng.sample(range(9, 17), k=rng.randint(1, 4)):
                    service = rng.choice(services)
                    appt = Appointment(professional=pro, service=service, customer=customer,
                                       start=datetime.combine(day, time(hour), tzinfo=tz))
                    appt.status = rng.choices(["completed", "no_show", "canceled"], weights=[75, 10, 15])[0]
                    appt.save()
                    n += 1
        self.stdout.write(f"{n} atendimentos de exemplo criados (cliente cliente.demo@example.com).")
