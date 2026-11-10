"""Tratamento de imagens enviadas (logo e fotos das empresas).

Todo arquivo é aberto com Pillow, validado (JPEG, PNG ou WebP, até 5 MB), corrigido pela orientação EXIF,
reduzido e REGRAVADO. Reencodar descarta metadados (ex.: localização do EXIF) e qualquer conteúdo
estranho anexado ao arquivo.
"""
import io

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers

MAX_BYTES = 5 * 1024 * 1024
ALLOWED = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = 40_000_000   # recusa "bombas" de descompressão


def process_image(upload, max_side, name):
    """Valida `upload` e devolve um `ContentFile` já reduzido a `max_side` px (PNG se houver transparência, senão JPEG)."""
    if upload is None:
        raise serializers.ValidationError({"image": "Envie um arquivo de imagem."})
    if upload.size > MAX_BYTES:
        raise serializers.ValidationError({"image": "A imagem deve ter no máximo 5 MB."})
    try:
        img = Image.open(upload)
        if img.format not in ALLOWED:
            raise serializers.ValidationError({"image": "Use uma imagem JPEG, PNG ou WebP."})
        img = ImageOps.exif_transpose(img)
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError):
        raise serializers.ValidationError({"image": "Arquivo de imagem inválido."})
    img.thumbnail((max_side, max_side))
    out, has_alpha = io.BytesIO(), img.mode in ("RGBA", "LA", "P") and "transparency" in img.info or img.mode in ("RGBA", "LA")
    if has_alpha:
        img.convert("RGBA").save(out, "PNG", optimize=True)
        ext = "png"
    else:
        img.convert("RGB").save(out, "JPEG", quality=85, optimize=True)
        ext = "jpg"
    return ContentFile(out.getvalue(), name=f"{name}.{ext}")
