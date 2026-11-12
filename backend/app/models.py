import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, Numeric, Integer, ForeignKey, Text, Boolean,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from .database import Base


def uid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Store(Base):
    __tablename__ = "stores"
    id = Column(String, primary_key=True, default=uid)
    name = Column(String(160), nullable=False)
    address = Column(Text, default="")
    contact = Column(String(80), default="")
    business_category = Column(String(100), default="Grocery")
    tax_rate = Column(Numeric(5, 2), default=5)
    language = Column(String(30), default="English")
    printer_width = Column(Integer, default=80)
    notifications = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    users = relationship("User", back_populates="store")
    products = relationship("Product", back_populates="store")


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False, index=True)
    full_name = Column(String(160), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    store = relationship("Store", back_populates="users")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("store_id", "sku", name="uq_product_store_sku"),
        Index("ix_product_store_name", "store_id", "name"),
    )
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False, index=True)
    sku = Column(String(60), nullable=False)
    name = Column(String(180), nullable=False)
    category = Column(String(100), default="General")
    description = Column(Text, default="")
    selling_price = Column(Numeric(12, 2), nullable=False)
    cost_price = Column(Numeric(12, 2), default=0)
    stock = Column(Integer, default=0, nullable=False)
    reorder_threshold = Column(Integer, default=5, nullable=False)
    qr_reference = Column(String(100), nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    store = relationship("Store", back_populates="products")


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        UniqueConstraint("store_id", "bill_number", name="uq_sale_store_bill"),
        UniqueConstraint("store_id", "client_token", name="uq_sale_store_client"),
        Index("ix_sale_store_created", "store_id", "created_at"),
    )
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False, index=True)
    bill_number = Column(String(60), nullable=False)
    client_token = Column(String(100), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)
    tax = Column(Numeric(12, 2), default=0)
    discount = Column(Numeric(12, 2), default=0)
    total = Column(Numeric(12, 2), nullable=False)
    item_count = Column(Integer, default=0)
    payment_method = Column(String(30), default="Cash")
    status = Column(String(30), default="Paid")
    source = Column(String(40), default="Internal QR Billing")
    created_at = Column(DateTime, default=utcnow, index=True)
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="sale", uselist=False, cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"
    id = Column(String, primary_key=True, default=uid)
    sale_id = Column(String, ForeignKey("sales.id"), nullable=False, index=True)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    product_name = Column(String(180), nullable=False)
    sku = Column(String(60), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)
    sale = relationship("Sale", back_populates="items")


class Payment(Base):
    __tablename__ = "payments"
    id = Column(String, primary_key=True, default=uid)
    sale_id = Column(String, ForeignKey("sales.id"), unique=True, nullable=False)
    method = Column(String(30), nullable=False)
    status = Column(String(30), default="Completed")
    amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=utcnow)
    sale = relationship("Sale", back_populates="payment")


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (
        UniqueConstraint("store_id", "purchase_number", name="uq_purchase_store_number"),
        Index("ix_purchase_store_created", "store_id", "created_at"),
    )
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False, index=True)
    purchase_number = Column(String(60), nullable=False)
    supplier_name = Column(String(180), nullable=False)
    invoice_number = Column(String(100), default="")
    source = Column(String(40), default="Manual Entry")
    original_filename = Column(String(255), default="")
    total_cost = Column(Numeric(12, 2), default=0)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"
    id = Column(String, primary_key=True, default=uid)
    purchase_id = Column(String, ForeignKey("purchases.id"), nullable=False, index=True)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    product_name = Column(String(180), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_cost = Column(Numeric(12, 2), default=0)
    line_total = Column(Numeric(12, 2), default=0)
    purchase = relationship("Purchase", back_populates="items")


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (Index("ix_movement_store_created", "store_id", "created_at"),)
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False, index=True)
    product_id = Column(String, ForeignKey("products.id"), nullable=False, index=True)
    movement_type = Column(String(30), nullable=False)
    quantity = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reference_id = Column(String(80), default="")
    note = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    product = relationship("Product")


class ImportRecord(Base):
    __tablename__ = "import_history"
    id = Column(String, primary_key=True, default=uid)
    store_id = Column(String, ForeignKey("stores.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    import_type = Column(String(30), nullable=False)
    status = Column(String(30), nullable=False)
    rows_received = Column(Integer, default=0)
    rows_imported = Column(Integer, default=0)
    message = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
