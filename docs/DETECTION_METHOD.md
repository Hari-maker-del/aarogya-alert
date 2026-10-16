# Detection method and limitations

AAROGYA ALERT uses a transparent, robust baseline to identify unusual increases in aggregate demonstration indicators. A signal is a prompt for authorized human review; it is not a diagnosis or confirmation of an outbreak.

## Baseline selection

1. The current observation is excluded from its own history.
2. Only observations from the previous 56 days are eligible; missing-quality observations are excluded.
3. If at least four observations are available for the same weekday, the detector uses up to the latest eight same-weekday values.
4. Otherwise, it uses the previous 28 calendar days as a rolling baseline.
5. Fewer than seven usable values means evidence is insufficient and no anomaly is emitted.
6. The expected value is the median. Scale is based on median absolute deviation, with a conservative square-root/count floor to avoid unstable scores when variation is near zero.

Same-weekday baselines with four to six observations are labelled limited evidence. Seven or more are labelled adequate evidence.

## Signal eligibility

A signal requires sufficient baseline evidence, an observed count at or above the configured small-count reporting threshold, a positive deviation, and a score meeting the configured threshold. Percentage change is omitted when the expected baseline is below one to avoid misleading division by zero or near-zero values.

Every evaluation includes a machine-readable detection status and a human-readable reason. Possible statuses include `signal`, `insufficient_data`, `below_minimum_count`, `within_baseline`, `below_threshold`, and `excluded`.

## Limitations

- These rules are a transparent heuristic, not a clinically validated outbreak detector.
- Synthetic test results do not establish real-world sensitivity, specificity, or predictive value.
- Data quality, reporting delays, seasonal shifts, changes in service access, and correlated indicators can affect results.
- A qualified public-health reviewer must verify any signal against appropriate sources before taking action.
