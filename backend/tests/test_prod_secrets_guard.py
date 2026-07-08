"""Secrets guard (F15 + S3).

Default secrets are refused in *any* environment unless the deploy
explicitly opts in with ALLOW_INSECURE_DEFAULTS=true (dev only).
"""
import pytest

from app.config import Settings, assert_secure_secrets


def _settings(**overrides) -> Settings:
    # _env_file=None keeps the local .env from leaking into the test.
    return Settings(_env_file=None, **overrides)


def test_defaults_without_opt_in_refuse_boot():
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        assert_secure_secrets(_settings())


def test_defaults_refuse_boot_even_in_development():
    with pytest.raises(RuntimeError, match="DEFAULT_ADMIN_PASSWORD"):
        assert_secure_secrets(_settings(environment="development"))


def test_defaults_refuse_boot_in_production_despite_opt_in_style_env():
    with pytest.raises(RuntimeError):
        assert_secure_secrets(_settings(environment="production"))


def test_defaults_with_explicit_opt_in_pass():
    assert_secure_secrets(_settings(allow_insecure_defaults=True))


def test_real_secrets_pass_without_opt_in():
    assert_secure_secrets(
        _settings(
            jwt_secret_key="a-real-secret",
            default_admin_password="a-real-password",
        )
    )


def test_partial_defaults_still_refused():
    with pytest.raises(RuntimeError, match="DEFAULT_ADMIN_PASSWORD"):
        assert_secure_secrets(_settings(jwt_secret_key="a-real-secret"))
