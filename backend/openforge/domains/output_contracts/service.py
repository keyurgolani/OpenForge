"""Output Contract domain service."""

from openforge.domains.common.crud import CrudDomainService
from openforge.db.models import OutputContractModel


class OutputContractService(CrudDomainService):
    """Service for managing output contracts."""

    model = OutputContractModel

    async def list_contracts(self, skip: int = 0, limit: int = 100):
        return await self.list_records(skip=skip, limit=limit)

    async def get_contract(self, contract_id):
        return await self.get_record(contract_id)

    async def create_contract(self, contract_data: dict):
        return await self.create_record(contract_data)

    async def update_contract(self, contract_id, contract_data: dict):
        return await self.update_record(contract_id, contract_data)

    async def delete_contract(self, contract_id):
        return await self.delete_record(contract_id)
