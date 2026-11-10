FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -r -m -u 1000 app && mkdir -p /data/media /data/static && chown -R app /data /app
USER app
ENV MEDIA_ROOT=/data/media STATIC_ROOT=/data/static
EXPOSE 8000
# Migrações e collectstatic rodam no serviço `migrate` (uma vez), para poder subir várias réplicas sem corrida.
# O número de workers vem de WEB_CONCURRENCY (padrão do gunicorn lê essa variável).
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--access-logfile", "-"]
