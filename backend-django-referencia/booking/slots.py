"""Cálculo de disponibilidade de horários.

É o único lugar com as regras de agenda; cliente, equipe e admin usam as mesmas funções:
expediente, pausas, bloqueios de datas, folga entre atendimentos, intervalo entre horários e conflitos.
"""

from datetime import datetime, timedelta
from django.db.models import Q
from django.utils import timezone
from .models import Appointment, TimeOff


def _dt(day, t):
    """Combina data e hora em um datetime com fuso (America/Sao_Paulo)."""
    return timezone.make_aware(datetime.combine(day, t))


def is_blocked(pro, day):
    """Indica se o dia está bloqueado para o profissional (bloqueio dele ou geral/feriado)."""
    return TimeOff.objects.filter(
        # Bloqueio do próprio profissional OU da empresa toda (professional vazio), nunca de outra empresa.
        Q(professional=pro) | Q(professional__isnull=True, company_id=pro.company_id),
        start_date__lte=day, end_date__gte=day).exists()


def slot_step(pro, offer, hours):
    """Intervalo (min) entre os horários oferecidos em uma faixa de expediente.

    Prioridade: o da própria faixa do dia, depois o do serviço, por fim o padrão do profissional.
    """
    return hours.slot_minutes or offer.slot_minutes or pro.slot_minutes


def slot_is_free(pro, offer, start, exclude=None):
    """Cabe no expediente, não invade pausas e respeita a folga entre atendimentos."""
    day = timezone.localtime(start).date()
    end = start + timedelta(minutes=offer.duration_minutes)
    wd = day.weekday()
    # Dia bloqueado (feriado ou folga): indisponível.
    if is_blocked(pro, day):
        return False
    # 1) O atendimento inteiro precisa caber em alguma faixa de expediente do dia.
    if not any(_dt(day, w.start_time) <= start and end <= _dt(day, w.end_time)
               for w in pro.working_hours.filter(weekday=wd)):
        return False
    # 2) Não pode tocar em nenhuma pausa (teste de interseção de intervalos).
    if any(_dt(day, b.start_time) < end and start < _dt(day, b.end_time)
           for b in pro.breaks.filter(weekday=wd)):
        return False
    # 3) Sem conflito com outro agendamento não cancelado (confirmado, concluído ou falta), considerando a folga antes e depois.
    buf = timedelta(minutes=pro.buffer_minutes)
    qs = Appointment.objects.filter(
        professional=pro, start__lt=end + buf, end__gt=start - buf
    ).exclude(status=Appointment.Status.CANCELED)
    if exclude:
        qs = qs.exclude(pk=exclude)
    return not qs.exists()


def available_slots(pro, offer, day):
    """Lista os horários de início livres de um profissional para um serviço em um dia.

    Percorre cada faixa de expediente do dia no intervalo dela (`slot_step`: faixa > serviço > profissional)
    e mantém só os horários futuros aprovados por `slot_is_free`.

    Retorna uma lista de datetimes com fuso.
    """
    now = timezone.now()
    dur = timedelta(minutes=offer.duration_minutes)
    out = []
    # Feriado ou folga: nenhum horário no dia.
    if is_blocked(pro, day):
        return out
    for w in pro.working_hours.filter(weekday=day.weekday()).order_by("start_time"):
        # Cada faixa tem o seu intervalo: anda de `step` em `step` oferecendo cada início em que o serviço ainda cabe.
        step = timedelta(minutes=slot_step(pro, offer, w))
        cur, stop = _dt(day, w.start_time), _dt(day, w.end_time)
        while cur + dur <= stop:
            if cur > now and slot_is_free(pro, offer, cur):
                out.append(cur)
            cur += step
    return out
