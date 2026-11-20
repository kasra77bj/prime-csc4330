"""Uniform error envelope: {"error": {"code", "message", "details"}} (docs/10 section 6)."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        self.status, self.code, self.message, self.details = status, code, message, details or {}


def not_found(what: str) -> APIError:
    return APIError(404, "NOT_FOUND", f"{what} not found")


def conflict(code: str, message: str, **details) -> APIError:
    return APIError(409, code, message, details)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def _api_error(_: Request, e: APIError):
        return JSONResponse(status_code=e.status,
                            content={"error": {"code": e.code, "message": e.message, "details": e.details}})

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, e: StarletteHTTPException):
        return JSONResponse(status_code=e.status_code,
                            content={"error": {"code": "HTTP_ERROR", "message": str(e.detail), "details": {}}})

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        return JSONResponse(status_code=422, content={"error": {
            "code": "VALIDATION_ERROR", "message": "Request validation failed",
            "details": {"errors": [{"loc": list(x["loc"]), "msg": x["msg"]} for x in e.errors()]}}})
