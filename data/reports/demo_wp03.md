# Data report: `demo_wp03`

Wall Panel WP-03: live demo stream (engineer accepts the AI change)

- Source: `generated/demo_wp03_stream.csv` · synthetic: True
- Rows: 2868 (768 printing) · layers 1–8 · duration 47.8 min

| Signal | Unit | min | mean | max |
|---|---|---|---|---|
| temperature | °C | 19.757 | 21.275 | 22.038 |
| pump_rpm | RPM | 12.000 | 27.750 | 42.000 |
| voltage | V | 11.881 | 12.030 | 12.253 |
| current | A | 0.612 | 0.754 | 0.878 |
| duty | % | -0.435 | -0.236 | -0.082 |
| motor_power | W | -3.458 | -2.100 | -0.838 |
| print_speed | mm/s | 10.000 | 10.000 | 10.000 |
| sll_width | mm | 18.050 | 19.389 | 19.709 |
| sll_height | mm | 15.003 | 15.528 | 15.981 |
| total_height | mm | 15.803 | 70.226 | 124.221 |
| flow | mm³/s | 2790.422 | 3010.614 | 3139.644 |
| delay_setting_min | min | 5.000 | 5.625 | 10.000 |

## Per layer (printing rows)

|   layer |   rpm |   width |   height |   temp |   power |   delay |
|--------:|------:|--------:|---------:|-------:|--------:|--------:|
|       1 |    12 |   19.6  |    15.8  |   22   |   -0.88 |       5 |
|       2 |    17 |   19.56 |    15.71 |   21.9 |   -1.27 |       5 |
|       3 |    22 |   19.61 |    15.66 |   21.8 |   -1.54 |       5 |
|       4 |    27 |   19.51 |    15.36 |   21.7 |   -2.4  |       5 |
|       5 |    27 |   18.6  |    15.51 |   21.6 |   -2.91 |       5 |
|       6 |    36 |   19.17 |    15.54 |   21.5 |   -3.32 |       5 |
|       7 |    39 |   19.56 |    15.34 |   19.8 |   -2.64 |       5 |
|       8 |    42 |   19.5  |    15.29 |   19.9 |   -1.84 |      10 |

## Validation

- OK
