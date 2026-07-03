"""Production secrets guard (F15)."""
import pytest

from app.config import Settings, assert_production_secrets


def test_production_with_default_secrets_refuses_boot():
    s = Settings(environment="production")
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        assert_production_secrets(s)


def test_production_with_real_secrets_passes():
    s = Settings(
        environment="production",
        jwt_secret_key="a-real-secret",
        default_admin_password="a-real-password",
    )
    assert_production_secrets(s)


def test_development_with_defaults_is_allowed():
    assert_production_secrets(Settings(environment="development"))
