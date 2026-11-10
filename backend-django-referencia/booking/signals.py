"""Sinais que mantêm o índice de busca (`Company.search_text`) sempre atualizado."""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Company, Professional, Service
from .search import refresh_search_text


@receiver([post_save, post_delete], sender=Service)
def service_changed(sender, instance, **kwargs):
    """Um serviço foi criado, renomeado ou excluído: atualiza a busca da empresa dele."""
    refresh_search_text(instance.company_id)


@receiver([post_save, post_delete], sender=Professional)
def professional_changed(sender, instance, **kwargs):
    """Um profissional mudou (nome, ativo) ou foi excluído: atualiza a busca da empresa dele."""
    refresh_search_text(instance.company_id)


@receiver(post_save, sender=Company)
def company_saved(sender, instance, **kwargs):
    """A empresa mudou (nome, categoria, cidade, endereço...): recalcula o próprio índice."""
    refresh_search_text(instance.pk)
