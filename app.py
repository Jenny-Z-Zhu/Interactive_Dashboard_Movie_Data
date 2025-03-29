import panel as pn
import hvplot.pandas
import pandas as pd
import numpy as np
import holoviews as hv
from scipy import stats
from vega_datasets import data

df = data.movies()

df = df.drop(columns=['Source'])

df.columns = df.columns.str.strip().str.replace('_', ' ', regex=False)

numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

# Convert 'Release_Date' to a timestamp format
df['Release Date'] = pd.to_datetime(df['Release Date'], errors='coerce')
# Extract only the year from the 'Release_Date' column
df['Release Date'] = df['Release Date'].dt.year

# Summarize column types, missing values, and unique entries
numeric_cols = list(df.select_dtypes(include=[np.number]).columns)  # Identify numeric columns
categorical_cols = list(df.select_dtypes(exclude=[np.number]).columns)  # Identify categorical columns

# Mannually Remove specific columns from the list of categorical columns
categorical_cols = [col for col in categorical_cols if col not in ['Title', 'Distributor', 'Director']]

# add one column to categorize the revenue into two categories Yes and No for 'Blockbuster' 
df = df.assign(Blockbuster=np.where(df['Worldwide Gross']>=  df['Worldwide Gross'].quantile(0.90), 'Yes', 'No'))

data_summary = {
    col: {
        'type': str(df[col].dtype),
        'unique_values': len(df[col].unique())
    } for col in df.columns
}

for col in numeric_cols:
    data_summary[col].update({
        'mean': df[col].mean(),
        'median': df[col].median(),
        'std': df[col].std(),
        'min': df[col].min(),
        'max': df[col].max(),
        'range': df[col].max() - df[col].min()
    })

summary_df = pd.DataFrame(data_summary).T


def create_control_panel(var=True, group=False, range_slider_col=None, filter_col=None,
                         var_default="Variable", group_default="Group By", range_name="Range Filter", filter_name="Filter By"):

    widgets = []

    # Create variable selector if 'var' is True
    if var:
        select_var = pn.widgets.Select(
            options=numeric_cols,  # Options are the numeric columns
            name=f"{var_default}: Choose the variable to analyze",  # Auto-generate name
            value=numeric_cols[0],  # Default to the first value in numeric_cols
            description=f"Choose the {var_default} to analyze"
        )
        widgets.append(select_var)

    # Create grouping selector if 'group' is True
    if group:
        select_group = pn.widgets.Select(
            options=categorical_cols,  # Filter categorical columns
            name=group_default,  # Default or user-specified name
            value=categorical_cols[0],  # Default to the first value in categorical_cols
            description=f"Choose the column to {group_default.lower()} by"
        )
        widgets.append(select_group)

    # Create range slider if 'range_slider_cols' is provided
    if range_slider_col:
        slider = pn.widgets.RangeSlider(
            name=f"{range_name}: {range_slider_col}",  # Auto-generate name with the column
            start=df[range_slider_col].min(),
            end=df[range_slider_col].max(),
            value=(df[range_slider_col].min(), df[range_slider_col].max()),  # Default range matches column range
            step=1,
            format='0[.]0'
        )
        widgets.append(slider)

    # Create filter selector for a specific column if 'filter_col' is provided
    if filter_col:
        filter_select = pn.widgets.Select(
            options=['Yes', 'No'],  # Unique values in the specified column
            name=f"{filter_name}: {filter_col}",  # Auto-generate name with the column
            value='Yes',  # Set default to the first value in the column
            description=f"{filter_name} column: {filter_col}"
        )
        widgets.append(filter_select)

    # Create layout with all widgets
    controls = pn.Column(
        '## Dashboard Controls',
        *widgets,  # Unpack widgets in the column
        sizing_mode='stretch_width'
    )

    return range_slider_col, filter_col, select_var, select_group, slider, filter_select, controls  # Add filter_select to the returned values

range_slider_col, filter_col, select_var, select_group, slider, filter_select, controls = create_control_panel(
    var=True,
    group=True,
    filter_col='Blockbuster', # we are particularly interested in how this variable affecting others
    range_slider_col='Release Date', # we are particularly interested in how this variable affecting others
    var_default="Numerical Variable",
    group_default="Grouping Category",
    range_name="Filter by"
)

# barchart
@pn.depends(select_group, slider)
def barchart(select_group, slider):
    
    filtered_df = df[
        (df[range_slider_col] >= slider[0]) &
        (df[range_slider_col] <= slider[1])
    ]

    # Create barchart
    bar_chart = filtered_df.groupby([select_group, filter_col]).size().unstack().hvplot.bar(
        x=select_group,
        y=['Yes', 'No'],
        stacked=True,
        title=f'{filter_col} by {select_group} in {slider[0]}-{slider[1]}',
        ylabel='Count',  # Update x-axis label to reflect the count
        xlabel=select_group,  # Update y-axis label to reflect the grouping variable
        legend='top'
    ).opts(xrotation=45) 

    return bar_chart

barchart_layout = pn.Column(
    pn.pane.Markdown("### Interactive Bar Chart (Demo Only, Do Not Click)"), 
    select_group,
    slider,
    pn.panel(barchart),  
    sizing_mode="stretch_both"
)


# Barchart for ranking
@pn.depends(select_var, slider)
def barchart_rank(select_var, slider):
    
    filtered_df = df[
        (pd.to_numeric(df[range_slider_col], errors='coerce') >= float(slider[0])) &
        (pd.to_numeric(df[range_slider_col], errors='coerce') <= float(slider[1]))
    ]

    # Convert select_var column to numeric and drop NaNs
    filtered_df[select_var] = pd.to_numeric(filtered_df[select_var], errors='coerce')
    top_movies = filtered_df.dropna(subset=[select_var]).sort_values(by=select_var, ascending=False)[:10]

    # Create bar chart
    barchart_rank = top_movies.sort_values(by=select_var, ascending=True).hvplot.barh(
        x='Title',
        y=select_var,
        title=f'Top 20 Movies by {select_var} in {slider[0]}-{slider[1]}',
        ylabel=select_var,
        xlabel='Movie Title',

    )
    
    return barchart_rank

barchart_rank_layout = pn.Column(
    pn.pane.Markdown("### Interactive Bar Chart (Demo Only, Do Not Click)"), 
    select_var,
    slider,
    pn.panel(barchart_rank),  
    sizing_mode="stretch_both"
)

# Histogram
@pn.depends(select_var, slider, filter_select)
def histogram_plot(select_var, slider, filter_select):

    # filter data based on parameters
    selected_df = df[df[filter_col] == filter_select]

    filtered_df = selected_df[
        (selected_df[range_slider_col] >= slider[0]) &
        (selected_df[range_slider_col] <= slider[1])
    ]

    # add density curve
    x_min = filtered_df[select_var].min()
    x_max = filtered_df[select_var].max()
    sw = np.linspace(x_min, x_max, 1000)
    fit = stats.norm.pdf(sw, np.mean(filtered_df[select_var]), np.std(filtered_df[select_var]))
    bin_width = (x_max - x_min) / 20
    fit_scaled = fit * len(filtered_df) * bin_width

    density_curve = hv.Curve((sw, fit_scaled)).opts(
    line_width=2,
    color='red'
)

    # Create the plot with some customization
    histogram = filtered_df.hvplot.hist(
        y=select_var,
        bins=20,
        height=300,
        alpha=0.5,
        title=f'Histogram for {select_var}',
        xlabel=select_var,
        ylabel='Count',
        **{'responsive': True,
           'legend': 'top_right'}
    )

    return density_curve * histogram

hist_layout = pn.Column(
    pn.pane.Markdown("### Interactive Historgram (Demo Only, Do Not Click)"), 
    select_var, select_group, slider, filter_select,
    pn.panel(histogram_plot),  
    sizing_mode="stretch_both"
)

# Boxplot
@pn.depends(select_var, select_group, slider, filter_select)
def box_plot(select_var, select_group, slider, filter_select):

    # filter data based on parameters
    selected_df = df[df[filter_col] == filter_select]

    filtered_df = selected_df[
        (selected_df[range_slider_col] >= slider[0]) &
        (selected_df[range_slider_col] <= slider[1])
    ].copy() # Create a copy to avoid SettingWithCopyWarning


    # get statistics for hover tooltips
    stats = {
        group: {
            'median': filtered_df[filtered_df[select_group]==group][select_var].median(),
            'mean': filtered_df[filtered_df[select_group]==group][select_var].mean(),
            'std': filtered_df[filtered_df[select_group]==group][select_var].std()
        } for group in filtered_df[select_group].unique()
    }

    # Create the box plot
    plot = filtered_df.hvplot.box(
        y=select_var,
        by=select_group,
        height=300,
        whisker_color='black',
        title=f'Boxplot for {select_var} by {select_group}',

        # Customize appearance
        box_alpha=0.7,
        outlier_alpha=0.7,
        width=400,
        legend='top',

        # Add statistical hover texts
        tools=['hover']
    )

    return plot

boxplot_layout = pn.Column(
    pn.pane.Markdown("### Interactive Boxplot (Demo Only, Do Not Click)"), 
    select_var, select_group, slider, filter_select,
    pn.panel(box_plot),  
    sizing_mode="stretch_both"
)


# Scatterplot
@pn.depends(select_var, slider, filter_select, select_group)
def create_scatter(x_var, slider, filter_select, group_var):

    # Filter data based on parameters
    selected_df = df[df[filter_col] == filter_select]

    filtered_df = selected_df[
        (selected_df[range_slider_col] >= slider[0]) &
        (selected_df[range_slider_col] <= slider[1])
    ]

    # Determine the y-variable
    y_var = range_slider_col if x_var != range_slider_col else 'hp'

    # Identify unique groups
    groups = filtered_df[group_var].unique()

    combined = None

    for i, g in enumerate(groups):

        group_data = filtered_df[filtered_df[group_var] == g]

        group_data = group_data.copy()

        # Introduce jitter to reduce overlapping points
        group_data[x_var] += np.random.uniform(-0.5, 0.5, size=len(group_data))
        group_data[y_var] += np.random.uniform(-0.5, 0.5, size=len(group_data))

        # Create scatter plot for this group with transparency
        scatter = group_data.hvplot.scatter(
            x=x_var,
            y=y_var,
            alpha=0.6,
            label=str(g),
            size=5
        )

        # Combine with previous groups
        if combined is None:
            combined = scatter
        else:
            combined = combined * scatter

    # Add options to the combined plot
    plot = combined.opts(
        width=600,
        height=400,
        title=f'Relationship between {x_var} and {y_var}\n(grouped by {group_var})',
        tools=['hover', 'box_zoom', 'reset'],
        show_grid=True,
        toolbar='above'
    )

    return plot

scatter_layout = pn.Column(
    pn.pane.Markdown("### Interactive Scartterplot (Demo Only, Do Not Click)"), 
    select_var, select_group, slider, filter_select,
    pn.panel(create_scatter),  
    sizing_mode="stretch_both"
)


# Build a Tabbed Dashboard by Combining All Visualizations
pn.extension()

def create_dashboard(widgets, plots):
    # Extract widgets
    select_var, select_group, slider, filter_select = widgets

    # Create separate control layouts for each tab
    # General Tab: Only select_group and slider
    general_controls = pn.Column(
        select_group,
        slider,
        sizing_mode="stretch_width"
    )

    # Distributions and Correlations Tabs: All widgets
    other_controls = pn.Column(
        *widgets,  # Include all widgets
        sizing_mode="stretch_width"
    )
    
    # Create specific widgets for barchart_rank
    barchart_rank_controls = pn.Column(
        select_var,  # Widget for selecting variable for barchart_rank
        slider,      # Slider for barchart_rank
        sizing_mode="stretch_width"
    )

    # Create tabs
    tabs = pn.Tabs(
        ('Basic', pn.Column(
            general_controls,  # Only select_group and slider
            pn.Row(plots['barchart'], sizing_mode='stretch_both'),
            sizing_mode='stretch_both'
        )),
        ('Ranking', pn.Column(
            barchart_rank_controls,  # Only select_group and slider
            pn.Row(plots['barchart_rank'], sizing_mode='stretch_both'),
            sizing_mode='stretch_both'
        )),
        ('Distribution', pn.Column(
            other_controls,  # All widgets
            pn.Row(plots['boxplot'], plots['histogram'], sizing_mode='stretch_both'),
            sizing_mode='stretch_both'
        )),
        ('Correlation', pn.Row(
            other_controls,  # All widgets
            plots['scatter'],
            sizing_mode='stretch_both'
        )),
        ('Statistics', pn.Column(
            # No widgets for stats tab
            plots['stats'],
            sizing_mode='stretch_both'
        )),
        sizing_mode='stretch_both'
    )

    main_layout = pn.Column(tabs, sizing_mode='stretch_both').servable()

    template = pn.template.VanillaTemplate(
        title="Interactive EDA Dashboard",
        sidebar=[],
        main=[main_layout],
    )

    return template

# Initialize and display the dashboard
dashboard = create_dashboard(
    widgets=[select_var, select_group, slider, filter_select],
    plots={
        'barchart': barchart,
        'barchart_rank': barchart_rank,
        'histogram': histogram_plot,
        'boxplot': box_plot,
        'scatter': create_scatter,
        'stats': pd.DataFrame(data_summary)
    }
)

dashboard.servable()