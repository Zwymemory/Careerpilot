from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPrice:
    input_cny_per_1m: float
    output_cny_per_1m: float


MODEL_PRICES: dict[str, ModelPrice] = {
    "deepseek-chat": ModelPrice(input_cny_per_1m=1.0, output_cny_per_1m=2.0),
    "gpt-4o-mini": ModelPrice(input_cny_per_1m=1.1, output_cny_per_1m=4.4),
}


def estimate_cost_cny(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    price = MODEL_PRICES.get(model, ModelPrice(input_cny_per_1m=1.0, output_cny_per_1m=3.0))
    cost = (
        prompt_tokens * price.input_cny_per_1m / 1_000_000
        + completion_tokens * price.output_cny_per_1m / 1_000_000
    )
    return round(cost, 6)
