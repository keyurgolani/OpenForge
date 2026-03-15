"""Output Contract domain router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db
from .schemas import (
    OutputContractCreate,
    OutputContractUpdate,
    OutputContractResponse,
    OutputContractListResponse,
)
from .service import OutputContractService

router = APIRouter()


def get_service(db: AsyncSession = Depends(get_db)) -> OutputContractService:
    return OutputContractService(db)


@router.get("", response_model=OutputContractListResponse)
async def list_output_contracts(
    skip: int = 0,
    limit: int = 100,
    service: OutputContractService = Depends(get_service),
):
    """List all output contracts."""
    contracts, total = await service.list_contracts(skip=skip, limit=limit)
    return OutputContractListResponse(
        contracts=[OutputContractResponse(**c) for c in contracts],
        total=total,
    )


@router.get("/{contract_id}", response_model=OutputContractResponse)
async def get_output_contract(
    contract_id: str,
    service: OutputContractService = Depends(get_service),
):
    """Get a specific output contract by ID."""
    contract = await service.get_contract(contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Output contract not found")
    return OutputContractResponse(**contract)


@router.post("", response_model=OutputContractResponse, status_code=201)
async def create_output_contract(
    contract_data: OutputContractCreate,
    service: OutputContractService = Depends(get_service),
):
    """Create a new output contract."""
    contract = await service.create_contract(contract_data.model_dump(exclude_unset=True))
    return OutputContractResponse(**contract)


@router.patch("/{contract_id}", response_model=OutputContractResponse)
async def update_output_contract(
    contract_id: str,
    contract_data: OutputContractUpdate,
    service: OutputContractService = Depends(get_service),
):
    """Update an existing output contract."""
    contract = await service.update_contract(
        contract_id, contract_data.model_dump(exclude_unset=True, exclude_none=True)
    )
    if contract is None:
        raise HTTPException(status_code=404, detail="Output contract not found")
    return OutputContractResponse(**contract)


@router.delete("/{contract_id}", status_code=204)
async def delete_output_contract(
    contract_id: str,
    service: OutputContractService = Depends(get_service),
):
    """Delete an output contract."""
    deleted = await service.delete_contract(contract_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Output contract not found")
