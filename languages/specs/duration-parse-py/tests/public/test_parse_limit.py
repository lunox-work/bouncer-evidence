"""R3: the result is an int no larger than 2^53 - 1."""
import pytest

from src.solution import parse_duration


# boundary 2: The largest duration parses

def test_boundary_2__largest_duration_in_mixed_units():
    assert parse_duration("104249991d8h59m991ms") == 9007199254740991


def test_boundary_2__largest_duration_in_milliseconds():
    assert parse_duration("9007199254740991ms") == 9007199254740991


# unhappy 3: Totals above the largest are rejected

def test_unhappy_3__rejects_one_above_largest_in_mixed_units():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("104249991d8h59m992ms")


def test_unhappy_3__rejects_huge_millisecond_count():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("99999999999999999999ms")


def test_unhappy_3__rejects_one_above_largest_in_milliseconds():
    with pytest.raises(ValueError, match="duration"):
        parse_duration("9007199254740992ms")
