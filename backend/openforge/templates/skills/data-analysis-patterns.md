---
name: Data Analysis Patterns
slug: data-analysis-patterns
description: Reference patterns for data analysis in Python. Covers pandas workflows, statistical tests, visualization templates, and common data cleaning operations.
tags:
  - data
  - analysis
  - python
  - reference
---

# Data Analysis Patterns

## Quick Reference: When to Use What

| Question Type | Statistical Method | Python |
|---------------|-------------------|--------|
| Is there a difference between groups? | t-test / Mann-Whitney | `scipy.stats.ttest_ind` |
| Is there an association? | Chi-square | `scipy.stats.chi2_contingency` |
| Does X predict Y? | Linear regression | `scipy.stats.linregress` or `sklearn` |
| What's the trend over time? | Moving average + decomposition | `pandas.rolling`, `statsmodels` |
| Are there clusters? | K-means / DBSCAN | `sklearn.cluster` |
| What's the distribution? | Histogram + Shapiro-Wilk test | `scipy.stats.shapiro` |

## Data Cleaning Checklist

```python
# Standard cleaning pipeline
df.info()                          # Types and nulls
df.describe()                      # Stats
df.duplicated().sum()              # Duplicates
df.isnull().sum() / len(df) * 100  # Null percentages
df.dtypes                          # Type issues

# Fix common issues
df = df.drop_duplicates()
df['date'] = pd.to_datetime(df['date'], errors='coerce')
df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
df = df.dropna(subset=['required_column'])
df['optional'] = df['optional'].fillna(df['optional'].median())
```

## Visualization Defaults

```python
import matplotlib.pyplot as plt
import seaborn as sns
plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette('viridis')
plt.rcParams['figure.figsize'] = (10, 6)
plt.rcParams['font.size'] = 12
```

## Chart Selection

- Comparison across categories: **Bar chart**
- Change over time: **Line chart**
- Correlation between variables: **Scatter plot**
- Distribution shape: **Histogram** or **Box plot**
- Composition / parts of whole: **Stacked bar** (not pie)
- Correlation matrix: **Heatmap**

## Statistical Reporting

- Always report sample sizes alongside statistics
- Report confidence intervals, not just point estimates
- Note when sample sizes are too small for reliable inference
- Clearly distinguish between correlation and causation
- Report p-values with practical significance context
