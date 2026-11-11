from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    shop_name: str = Field(min_length=2, max_length=160)
    shop_address: str = ""
    contact: str = ""
    business_category: str = "Grocery"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    sku: Optional[str] = Field(default=None, max_length=60)
    category: str = Field(default="General", max_length=100)
    description: str = ""
    selling_price: float = Field(gt=0)
    cost_price: float = Field(default=0, ge=0)
    initial_stock: int = Field(default=0, ge=0)
    reorder_threshold: int = Field(default=5, ge=0)

    @field_validator("name", "category")
    @classmethod
    def clean_text(cls, value):
        return value.strip()


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=180)
    category: Optional[str] = None
    description: Optional[str] = None
    selling_price: Optional[float] = Field(default=None, gt=0)
    cost_price: Optional[float] = Field(default=None, ge=0)
    reorder_threshold: Optional[int] = Field(default=None, ge=0)
    active: Optional[bool] = None


class SaleItemIn(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=100000)


class SaleCreate(BaseModel):
    client_token: str = Field(min_length=8, max_length=100)
    items: List[SaleItemIn] = Field(min_length=1, max_length=200)
    payment_method: str = Field(default="Cash", pattern="^(Cash|UPI|Card)$")
    discount: float = Field(default=0, ge=0)


class PurchaseItemIn(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=1000000)
    unit_cost: float = Field(default=0, ge=0)


class PurchaseCreate(BaseModel):
    supplier_name: str = Field(min_length=2, max_length=180)
    invoice_number: str = Field(default="", max_length=100)
    items: List[PurchaseItemIn] = Field(min_length=1, max_length=500)
    source: str = Field(default="Manual Entry")
    original_filename: str = ""
    notes: str = ""

    @field_validator("supplier_name")
    @classmethod
    def supplier_not_blank(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Supplier name is required")
        return value


class StockAdjustment(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=1000000)
    direction: str = Field(pattern="^(add|remove)$")
    reason: str = Field(min_length=2, max_length=300)


class SettingsUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    address: str = ""
    contact: str = ""
    business_category: str = "Grocery"
    tax_rate: float = Field(default=5, ge=0, le=100)
    language: str = "English"
    printer_width: int = Field(default=80)
    notifications: bool = True

    @field_validator("printer_width")
    @classmethod
    def valid_printer(cls, value):
        if value not in (58, 80):
            raise ValueError("Printer width must be 58 or 80 mm")
        return value


class AssistantQuery(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    language: str = "English"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
