# Data report: `demo_wp03`

Wall Panel WP-03: live demo stream (engineer accepts the AI change)

- Source: `generated/demo_wp03_stream.csv` · synthetic: True
- Rows: 2868 (768 printing) · layers 1–8 · duration 47.8 min

| Signal | Unit | min | mean | max |
|---|---|---|---|---|
| temperature | °C | 19.680 | 21.272 | 22.120 |
| pump_rpm | RPM | 12.000 | 27.750 | 42.000 |
| voltage | V | 11.882 | 12.030 | 12.250 |
| current | A | 0.606 | 0.754 | 0.876 |
| duty | % | -0.435 | -0.236 | -0.082 |
| motor_power | W | -3.432 | -2.100 | -0.836 |
| print_speed | mm/s | 10.000 | 10.000 | 10.000 |
| sll_width | mm | 17.716 | 19.398 | 20.159 |
| sll_height | mm | 14.523 | 15.527 | 16.531 |
| total_height | mm | 15.803 | 70.226 | 124.221 |
| flow | mm³/s | 2703.023 | 3011.775 | 3267.657 |
| delay_setting_min | min | 5.000 | 5.625 | 10.000 |

## Per layer (printing rows)

|   layer |   rpm |   width |   height |   temp |   power |   delay |
|--------:|------:|--------:|---------:|-------:|--------:|--------:|
|       1 |    12 |   19.63 |    15.81 |  22    |   -0.88 |       5 |
|       2 |    17 |   19.58 |    15.73 |  21.89 |   -1.27 |       5 |
|       3 |    22 |   19.6  |    15.63 |  21.8  |   -1.53 |       5 |
|       4 |    27 |   19.51 |    15.36 |  21.7  |   -2.4  |       5 |
|       5 |    27 |   18.61 |    15.52 |  21.59 |   -2.91 |       5 |
|       6 |    36 |   19.21 |    15.52 |  21.5  |   -3.32 |       5 |
|       7 |    39 |   19.52 |    15.36 |  19.8  |   -2.63 |       5 |
|       8 |    42 |   19.52 |    15.29 |  19.9  |   -1.84 |      10 |

## Validation

- OK
