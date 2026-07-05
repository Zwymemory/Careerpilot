from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.provider_balance import ProviderBalanceResponse
from app.services.provider_balance import ProviderBalanceService

router = APIRouter(prefix="/provider-balances", tags=["provider-balances"])


@router.get("", response_model=ProviderBalanceResponse)
async def provider_balances(settings: Settings = Depends(get_settings)) -> ProviderBalanceResponse:
    return await ProviderBalanceService(settings).get_balances()
