from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from sqlalchemy.exc import IntegrityError
from app.api import engagements, pages, tasks, records, relationships, phase3

app = FastAPI(title="VAPT Workspace", version="0.3.0")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
for router in [engagements.router, pages.router, tasks.router, records.router, relationships.router, phase3.router]:
    app.include_router(router, prefix="/api/v1")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(HTTPException)
async def http_error(_: Request, error: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code, content={"error": {"code": error.status_code, "message": str(error.detail)}}
    )


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": 422,
                "message": "Validation failed",
                "details": [{"location": list(e["loc"]), "message": e["msg"]} for e in error.errors()],
            }
        },
    )


@app.exception_handler(IntegrityError)
async def integrity_error(_: Request, error: IntegrityError) -> JSONResponse:
    return JSONResponse(
        status_code=409, content={"error": {"code": 409, "message": "Database constraint conflict; reload and retry"}}
    )
