"""Migração de dados: associa tudo o que já existia a uma "Empresa padrão".

Bancos criados antes do suporte a várias empresas têm serviços, profissionais e
bloqueios sem empresa. Eles passam a pertencer à "Empresa padrão", e os usuários
da equipe (is_staff) viram administradores dela, mantendo o acesso ao painel.
"""
from django.conf import settings
from django.db import migrations


def assign_default_company(apps, schema_editor):
    """Cria a empresa padrão (se houver dados órfãos) e liga os registros e a equipe a ela."""
    Company = apps.get_model("booking", "Company")
    Member = apps.get_model("booking", "CompanyMember")
    orphans = [apps.get_model("booking", name).objects.filter(company__isnull=True)
               for name in ("Service", "Professional", "TimeOff")]
    if not any(q.exists() for q in orphans):
        return  # banco novo: nada a migrar
    company, _ = Company.objects.get_or_create(slug="empresa-padrao", defaults={"name": "Empresa padrão"})
    for q in orphans:
        q.update(company=company)
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    for user in User.objects.filter(is_staff=True):
        Member.objects.get_or_create(company=company, user=user)


class Migration(migrations.Migration):
    dependencies = [
        ("booking", "0003_companies"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [migrations.RunPython(assign_default_company, migrations.RunPython.noop)]
