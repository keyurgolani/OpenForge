"""Tests for the logarithmic autoscaler."""

from unittest.mock import MagicMock
from openforge.worker.autoscale import LogarithmicAutoscaler


class TestLogarithmicGrowth:
    """Test the growth formula: new = current + ceil(log2(current + 1))."""

    def test_growth_from_4(self):
        scaler = LogarithmicAutoscaler(MagicMock(), max_concurrency=16, min_concurrency=4)
        assert scaler._desired_capacity(current=4, busy=4) == 7  # 4 + ceil(log2(5)) = 4+3

    def test_growth_from_7(self):
        scaler = LogarithmicAutoscaler(MagicMock(), max_concurrency=16, min_concurrency=4)
        assert scaler._desired_capacity(current=7, busy=7) == 10  # 7 + ceil(log2(8)) = 7+3

    def test_growth_from_10(self):
        scaler = LogarithmicAutoscaler(MagicMock(), max_concurrency=20, min_concurrency=4)
        assert scaler._desired_capacity(current=10, busy=10) == 14  # 10 + ceil(log2(11)) ≈ 10+4

    def test_capped_at_max(self):
        scaler = LogarithmicAutoscaler(MagicMock(), max_concurrency=8, min_concurrency=4)
        assert scaler._desired_capacity(current=7, busy=7) == 8  # capped

    def test_no_growth_when_idle(self):
        scaler = LogarithmicAutoscaler(MagicMock(), max_concurrency=16, min_concurrency=4)
        assert scaler._desired_capacity(current=8, busy=2) == 8  # no growth: busy < 75%

    def test_shrink_to_min(self):
        scaler = LogarithmicAutoscaler(MagicMock(), max_concurrency=16, min_concurrency=4)
        assert scaler._desired_capacity(current=8, busy=0) == 7  # shrink by 1

    def test_floor_at_min(self):
        scaler = LogarithmicAutoscaler(MagicMock(), max_concurrency=16, min_concurrency=4)
        assert scaler._desired_capacity(current=4, busy=0) == 4  # already at min
