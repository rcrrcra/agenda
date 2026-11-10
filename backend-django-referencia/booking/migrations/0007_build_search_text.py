"""Migração de dados: preenche o índice de busca (`Company.search_text`) das empresas já existentes.

As empresas criadas depois passam a ter o índice mantido pelos sinais de `booking/signals.py`.
A função de normalização é copiada aqui de propósito: migrações não devem depender do código atual.
"""
import unicodedata

from django.db import migrations


def normalize(text):
    """Texto em minúsculas e sem acentos."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def build_search_text(apps, schema_editor):
    """Recalcula o texto de busca de cada empresa (dados da empresa + serviços + profissionais ativos)."""
    Company = apps.get_model("booking", "Company")
    Service = apps.get_model("booking", "Service")
    Professional = apps.get_model("booking", "Professional")
    for company in Company.objects.all():
        parts = [company.name, company.category, company.city, company.address, company.description]
        parts += list(Service.objects.filter(company=company).values_list("name", flat=True))
        parts += list(Professional.objects.filter(company=company, active=True).values_list("name", flat=True))
        text = normalize(" | ".join(p for p in parts if p))
        Company.objects.filter(pk=company.pk).update(search_text=text)


class Migration(migrations.Migration):
    dependencies = [("booking", "0006_slots_city_favorites")]
    operations = [migrations.RunPython(build_search_text, migrations.RunPython.noop)]
