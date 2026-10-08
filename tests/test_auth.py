import os
from pathlib import Path

import pytest

from backend import main


def test_customer_login_auto_creates_profile(tmp_path):
    db_file = tmp_path / "greenlife_test.db"
    main.DATABASE_PATH = db_file
    main.DEMO_SESSIONS.clear()
    main.initialize_database()

    response = main.login(main.LoginRequest(email="demo.user@example.com", password="123456"))

    assert response["role"] == "customer"
    assert response["email"] == "demo.user@example.com"

    profile = main.get_profile(session=main.DEMO_SESSIONS[response["token"]])
    assert profile["email"] == "demo.user@example.com"
    assert profile["full_name"] == "Demo User"


def test_registered_customer_can_sign_in(tmp_path):
    main.DATABASE_PATH = tmp_path / "greenlife_registered_test.db"
    main.DEMO_SESSIONS.clear()
    main.initialize_database()

    result = main.register_profile(main.ProfileCreate(
        full_name="New Customer",
        email="new.customer@example.com",
        password="customer-secret",
        phone="9876543210",
    ))
    session = main.login(main.LoginRequest(
        email="new.customer@example.com",
        password="customer-secret",
    ))

    assert result["message"] == "Profile created. You can now sign in."
    assert session["role"] == "customer"
    assert session["email"] == "new.customer@example.com"


def test_phone_number_must_be_exactly_10_digits():
    with pytest.raises(Exception):
        main.ProfileCreate(
            full_name="Test User",
            email="test@example.com",
            password="password123",
            phone="123456789",
        )

    with pytest.raises(Exception):
        main.ProfileCreate(
            full_name="Test User",
            email="test@example.com",
            password="password123",
            phone="12345678901",
        )

    profile = main.ProfileCreate(
        full_name="Test User",
        email="test@example.com",
        password="password123",
        phone="9876543210",
    )

    assert profile.phone == "9876543210"


def test_login_role_selection_is_enforced(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setattr(main, "ADMIN_PASSWORD", "private-admin-password")
    main.DEMO_SESSIONS.clear()
    with pytest.raises(main.HTTPException) as customer_as_admin:
        main.login(main.LoginRequest(email="demo.user@example.com", password="123456", role="admin"))
    assert customer_as_admin.value.status_code == 403

    with pytest.raises(main.HTTPException) as admin_as_customer:
        main.login(main.LoginRequest(email=main.ADMIN_EMAIL, password=main.ADMIN_PASSWORD, role="customer"))
    assert admin_as_customer.value.status_code == 403


def test_admin_login_requires_private_configuration(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_EMAIL", "")
    monkeypatch.setattr(main, "ADMIN_PASSWORD", "")

    with pytest.raises(main.HTTPException) as unconfigured_admin:
        main.login(main.LoginRequest(email="admin@example.com", password="greenlife", role="admin"))

    assert unconfigured_admin.value.status_code == 503
    assert "GREENLIFE_ADMIN_EMAIL" in unconfigured_admin.value.detail


def test_admin_login_accepts_only_configured_credentials(monkeypatch):
    monkeypatch.setattr(main, "ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setattr(main, "ADMIN_PASSWORD", "private-admin-password")
    main.DEMO_SESSIONS.clear()

    session = main.login(main.LoginRequest(
        email="admin@example.com",
        password="private-admin-password",
        role="admin",
    ))

    assert session["role"] == "admin"


def test_admin_orders_include_ordered_product_details(tmp_path):
    main.DATABASE_PATH = tmp_path / "greenlife_orders_test.db"
    main.DEMO_SESSIONS.clear()
    main.initialize_database()
    product = main.list_products()[0]

    created = main.create_order(main.OrderCreate(
        customer_name="Demo Customer",
        email="demo.customer@example.com",
        address="123 Green Street",
        items=[main.OrderItem(product_id=product["id"], quantity=2)],
    ))

    orders = main.admin_orders({})
    assert orders[0]["id"] == created["id"]
    assert orders[0]["items"] == [{
        "product_id": product["id"],
        "name": product["name"],
        "quantity": 2,
        "unit_price": product["price"],
    }]
