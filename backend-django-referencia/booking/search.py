"""Busca de empresas para o cliente.

A busca olha o nome, a categoria, a cidade, o endereço e a descrição da empresa, além dos nomes dos
serviços e dos profissionais ativos. Ignora acentos e maiúsculas ("sao paulo" acha "São Paulo").

Para isso, cada empresa guarda `search_text`: um texto já normalizado com tudo o que pode ser buscado,
atualizado pelos sinais de `signals.py` sempre que a empresa, um serviço ou um profissional mudam.
"""
import unicodedata

from .models import Company

MIN_QUERY_LENGTH = 2   # abaixo disso não devolve nada (evita listar todas as empresas)
MAX_TERMS = 6          # termos considerados por busca
SEARCH_LIMIT = 20      # máximo de empresas devolvidas


def normalize(text):
    """Texto em minúsculas e sem acentos ("São Paulo" -> "sao paulo")."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def build_search_text(company):
    """Junta, já normalizados, todos os textos buscáveis de uma empresa."""
    parts = [company.name, company.category, company.city, company.address, company.description]
    parts += list(company.services.values_list("name", flat=True))
    parts += list(company.professionals.filter(active=True).values_list("name", flat=True))
    return normalize(" | ".join(p for p in parts if p))


def refresh_search_text(company_id):
    """Recalcula o `search_text` de uma empresa (não faz nada se ela não existir mais)."""
    company = Company.objects.filter(pk=company_id).first()
    if company:
        Company.objects.filter(pk=company_id).update(search_text=build_search_text(company))


def search_companies(query):
    """Empresas ativas que casam com TODOS os termos digitados (cada termo pode casar com qualquer campo).

    Ex.: "barbearia campinas" acha empresas da categoria Barbearia na cidade de Campinas.
    Devolve um queryset vazio se a busca tiver menos de `MIN_QUERY_LENGTH` letras.
    """
    terms = [t for t in (normalize(w) for w in (query or "").split()[:MAX_TERMS]) if t]
    if len("".join(terms)) < MIN_QUERY_LENGTH:
        return Company.objects.none()
    qs = Company.objects.filter(active=True)
    for term in terms:
        qs = qs.filter(search_text__contains=term)
    return qs.order_by("name")
