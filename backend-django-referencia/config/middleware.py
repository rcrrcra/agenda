"""Middleware de apoio à implantação atrás de proxy reverso."""
from django.conf import settings


class TrustedProxyMiddleware:
    """Com `TRUST_PROXY=1`, usa o IP que o Nginx informa em `X-Real-IP` como `REMOTE_ADDR`.

    Sem isso, atrás do proxy todas as requisições pareceriam vir do mesmo IP (o do Nginx), o que quebraria o
    limite de tentativas de login por IP e o IP gravado no log de auditoria. Só ligue quando o Django NÃO estiver
    exposto diretamente: o Nginx sobrescreve o cabeçalho, então o cliente não consegue forjá-lo.
    """

    def __init__(self, get_response):
        """Guarda a próxima etapa da cadeia de middlewares."""
        self.get_response = get_response

    def __call__(self, request):
        """Ajusta `REMOTE_ADDR` (se confiável) e segue a requisição."""
        if settings.TRUST_PROXY and request.META.get("HTTP_X_REAL_IP"):
            request.META["REMOTE_ADDR"] = request.META["HTTP_X_REAL_IP"].strip()
        return self.get_response(request)
