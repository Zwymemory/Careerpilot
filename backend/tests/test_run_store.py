from app.schemas.run import RunState
from app.services.run_store import RunStore


def test_create_run_is_idempotent_for_same_user_and_key() -> None:
    store = RunStore()

    first = store.create_run("u1", "Generate a Week1 run trace", "same-key")
    second = store.create_run("u1", "Generate a Week1 run trace", "same-key")

    assert first.run_id == second.run_id
    assert len(store.list_runs()) == 1


def test_state_change_adds_trace_event() -> None:
    store = RunStore()
    run = store.create_run("u1", "Generate a Week1 run trace", None)

    store.set_state(run.run_id, RunState.PLANNING, "planner")

    updated = store.get_run(run.run_id)
    assert updated is not None
    assert updated.state == RunState.PLANNING
    assert updated.current_step == "planner"
    assert len(updated.events) == 2
