"""
Autenticación básica (Basic Auth) para proteger la web.
Las credenciales se leen del archivo .env (nunca van en el código).
"""
import os
import secrets
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic()


def verificar_credenciales(
    credentials: HTTPBasicCredentials = Depends(security),
):
    usuario_correcto = os.getenv("WEB_USUARIO", "comercial")
    password_correcta = os.getenv("WEB_PASSWORD", "Keiros2026")

    # compare_digest evita ataques de timing (mejor práctica)
    usuario_ok = secrets.compare_digest(credentials.username, usuario_correcto)
    password_ok = secrets.compare_digest(credentials.password, password_correcta)

    if not (usuario_ok and password_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username