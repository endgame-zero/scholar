from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    llm_base_url: str = "https://router.huggingface.co/v1"
    llm_model: str = "meta-llama/Llama-3.3-70B-Instruct"
    llm_api_key: str
    tavily_api_key: str

    model_config = {"env_file": ".env"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
