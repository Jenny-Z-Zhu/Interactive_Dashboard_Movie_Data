importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.6.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.6.1/dist/wheels/panel-1.6.1-py3-none-any.whl', 'pyodide-http==0.2.1', 'holoviews', 'hvplot', 'numpy', 'pandas', 'scipy', 'vega_datasets']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  \nimport asyncio\n\nfrom panel.io.pyodide import init_doc, write_doc\n\ninit_doc()\n\nimport panel as pn\nimport hvplot.pandas\nimport pandas as pd\nimport numpy as np\nimport holoviews as hv\nfrom scipy import stats\nfrom vega_datasets import data\n\ndf = data.movies()\n\ndf = df.drop(columns=['Source'])\n\ndf.columns = df.columns.str.strip().str.replace('_', ' ', regex=False)\n\nnumeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()\ncategorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()\n\n# Convert 'Release_Date' to a timestamp format\ndf['Release Date'] = pd.to_datetime(df['Release Date'], errors='coerce')\n# Extract only the year from the 'Release_Date' column\ndf['Release Date'] = df['Release Date'].dt.year\n\n# Summarize column types, missing values, and unique entries\nnumeric_cols = list(df.select_dtypes(include=[np.number]).columns)  # Identify numeric columns\ncategorical_cols = list(df.select_dtypes(exclude=[np.number]).columns)  # Identify categorical columns\n\n# Mannually Remove specific columns from the list of categorical columns\ncategorical_cols = [col for col in categorical_cols if col not in ['Title', 'Distributor', 'Director']]\n\n# add one column to categorize the revenue into two categories Yes and No for 'Blockbuster' \ndf = df.assign(Blockbuster=np.where(df['Worldwide Gross']>=  df['Worldwide Gross'].quantile(0.90), 'Yes', 'No'))\n\ndata_summary = {\n    col: {\n        'type': str(df[col].dtype),\n        'unique_values': len(df[col].unique())\n    } for col in df.columns\n}\n\nfor col in numeric_cols:\n    data_summary[col].update({\n        'mean': df[col].mean(),\n        'median': df[col].median(),\n        'std': df[col].std(),\n        'min': df[col].min(),\n        'max': df[col].max(),\n        'range': df[col].max() - df[col].min()\n    })\n\nsummary_df = pd.DataFrame(data_summary).T\n\n\ndef create_control_panel(var=True, group=False, range_slider_col=None, filter_col=None,\n                         var_default="Variable", group_default="Group By", range_name="Range Filter", filter_name="Filter By"):\n\n    widgets = []\n\n    # Create variable selector if 'var' is True\n    if var:\n        select_var = pn.widgets.Select(\n            options=numeric_cols,  # Options are the numeric columns\n            name=f"{var_default}: Choose the variable to analyze",  # Auto-generate name\n            value=numeric_cols[0],  # Default to the first value in numeric_cols\n            description=f"Choose the {var_default} to analyze"\n        )\n        widgets.append(select_var)\n\n    # Create grouping selector if 'group' is True\n    if group:\n        select_group = pn.widgets.Select(\n            options=categorical_cols,  # Filter categorical columns\n            name=group_default,  # Default or user-specified name\n            value=categorical_cols[0],  # Default to the first value in categorical_cols\n            description=f"Choose the column to {group_default.lower()} by"\n        )\n        widgets.append(select_group)\n\n    # Create range slider if 'range_slider_cols' is provided\n    if range_slider_col:\n        slider = pn.widgets.RangeSlider(\n            name=f"{range_name}: {range_slider_col}",  # Auto-generate name with the column\n            start=df[range_slider_col].min(),\n            end=df[range_slider_col].max(),\n            value=(df[range_slider_col].min(), df[range_slider_col].max()),  # Default range matches column range\n            step=1,\n            format='0[.]0'\n        )\n        widgets.append(slider)\n\n    # Create filter selector for a specific column if 'filter_col' is provided\n    if filter_col:\n        filter_select = pn.widgets.Select(\n            options=['Yes', 'No'],  # Unique values in the specified column\n            name=f"{filter_name}: {filter_col}",  # Auto-generate name with the column\n            value='Yes',  # Set default to the first value in the column\n            description=f"{filter_name} column: {filter_col}"\n        )\n        widgets.append(filter_select)\n\n    # Create layout with all widgets\n    controls = pn.Column(\n        '## Dashboard Controls',\n        *widgets,  # Unpack widgets in the column\n        sizing_mode='stretch_width'\n    )\n\n    return range_slider_col, filter_col, select_var, select_group, slider, filter_select, controls  # Add filter_select to the returned values\n\nrange_slider_col, filter_col, select_var, select_group, slider, filter_select, controls = create_control_panel(\n    var=True,\n    group=True,\n    filter_col='Blockbuster', # we are particularly interested in how this variable affecting others\n    range_slider_col='Release Date', # we are particularly interested in how this variable affecting others\n    var_default="Numerical Variable",\n    group_default="Grouping Category",\n    range_name="Filter by"\n)\n\n# barchart\n@pn.depends(select_group, slider)\ndef barchart(select_group, slider):\n    \n    filtered_df = df[\n        (df[range_slider_col] >= slider[0]) &\n        (df[range_slider_col] <= slider[1])\n    ]\n\n    # Create barchart\n    bar_chart = filtered_df.groupby([select_group, filter_col]).size().unstack().hvplot.bar(\n        x=select_group,\n        y=['Yes', 'No'],\n        stacked=True,\n        title=f'{filter_col} by {select_group} in {slider[0]}-{slider[1]}',\n        ylabel='Count',  # Update x-axis label to reflect the count\n        xlabel=select_group,  # Update y-axis label to reflect the grouping variable\n        legend='top'\n    ).opts(xrotation=45) \n\n    return bar_chart\n\nbarchart_layout = pn.Column(\n    pn.pane.Markdown("### Interactive Bar Chart (Demo Only, Do Not Click)"), \n    select_group,\n    slider,\n    pn.panel(barchart),  \n    sizing_mode="stretch_both"\n)\n\n\n# Barchart for ranking\n@pn.depends(select_var, slider)\ndef barchart_rank(select_var, slider):\n    \n    filtered_df = df[\n        (pd.to_numeric(df[range_slider_col], errors='coerce') >= float(slider[0])) &\n        (pd.to_numeric(df[range_slider_col], errors='coerce') <= float(slider[1]))\n    ]\n\n    # Convert select_var column to numeric and drop NaNs\n    filtered_df[select_var] = pd.to_numeric(filtered_df[select_var], errors='coerce')\n    top_movies = filtered_df.dropna(subset=[select_var]).sort_values(by=select_var, ascending=False)[:10]\n\n    # Create bar chart\n    barchart_rank = top_movies.sort_values(by=select_var, ascending=True).hvplot.barh(\n        x='Title',\n        y=select_var,\n        title=f'Top 20 Movies by {select_var} in {slider[0]}-{slider[1]}',\n        ylabel=select_var,\n        xlabel='Movie Title',\n\n    )\n    \n    return barchart_rank\n\nbarchart_rank_layout = pn.Column(\n    pn.pane.Markdown("### Interactive Bar Chart (Demo Only, Do Not Click)"), \n    select_var,\n    slider,\n    pn.panel(barchart_rank),  \n    sizing_mode="stretch_both"\n)\n\n# Histogram\n@pn.depends(select_var, slider, filter_select)\ndef histogram_plot(select_var, slider, filter_select):\n\n    # filter data based on parameters\n    selected_df = df[df[filter_col] == filter_select]\n\n    filtered_df = selected_df[\n        (selected_df[range_slider_col] >= slider[0]) &\n        (selected_df[range_slider_col] <= slider[1])\n    ]\n\n    # add density curve\n    x_min = filtered_df[select_var].min()\n    x_max = filtered_df[select_var].max()\n    sw = np.linspace(x_min, x_max, 1000)\n    fit = stats.norm.pdf(sw, np.mean(filtered_df[select_var]), np.std(filtered_df[select_var]))\n    bin_width = (x_max - x_min) / 20\n    fit_scaled = fit * len(filtered_df) * bin_width\n\n    density_curve = hv.Curve((sw, fit_scaled)).opts(\n    line_width=2,\n    color='red'\n)\n\n    # Create the plot with some customization\n    histogram = filtered_df.hvplot.hist(\n        y=select_var,\n        bins=20,\n        height=300,\n        alpha=0.5,\n        title=f'Histogram for {select_var}',\n        xlabel=select_var,\n        ylabel='Count',\n        **{'responsive': True,\n           'legend': 'top_right'}\n    )\n\n    return density_curve * histogram\n\nhist_layout = pn.Column(\n    pn.pane.Markdown("### Interactive Historgram (Demo Only, Do Not Click)"), \n    select_var, select_group, slider, filter_select,\n    pn.panel(histogram_plot),  \n    sizing_mode="stretch_both"\n)\n\n# Boxplot\n@pn.depends(select_var, select_group, slider, filter_select)\ndef box_plot(select_var, select_group, slider, filter_select):\n\n    # filter data based on parameters\n    selected_df = df[df[filter_col] == filter_select]\n\n    filtered_df = selected_df[\n        (selected_df[range_slider_col] >= slider[0]) &\n        (selected_df[range_slider_col] <= slider[1])\n    ].copy() # Create a copy to avoid SettingWithCopyWarning\n\n\n    # get statistics for hover tooltips\n    stats = {\n        group: {\n            'median': filtered_df[filtered_df[select_group]==group][select_var].median(),\n            'mean': filtered_df[filtered_df[select_group]==group][select_var].mean(),\n            'std': filtered_df[filtered_df[select_group]==group][select_var].std()\n        } for group in filtered_df[select_group].unique()\n    }\n\n    # Create the box plot\n    plot = filtered_df.hvplot.box(\n        y=select_var,\n        by=select_group,\n        height=300,\n        whisker_color='black',\n        title=f'Boxplot for {select_var} by {select_group}',\n\n        # Customize appearance\n        box_alpha=0.7,\n        outlier_alpha=0.7,\n        width=400,\n        legend='top',\n\n        # Add statistical hover texts\n        tools=['hover']\n    )\n\n    return plot\n\nboxplot_layout = pn.Column(\n    pn.pane.Markdown("### Interactive Boxplot (Demo Only, Do Not Click)"), \n    select_var, select_group, slider, filter_select,\n    pn.panel(box_plot),  \n    sizing_mode="stretch_both"\n)\n\n\n# Scatterplot\n@pn.depends(select_var, slider, filter_select, select_group)\ndef create_scatter(x_var, slider, filter_select, group_var):\n\n    # Filter data based on parameters\n    selected_df = df[df[filter_col] == filter_select]\n\n    filtered_df = selected_df[\n        (selected_df[range_slider_col] >= slider[0]) &\n        (selected_df[range_slider_col] <= slider[1])\n    ]\n\n    # Determine the y-variable\n    y_var = range_slider_col if x_var != range_slider_col else 'hp'\n\n    # Identify unique groups\n    groups = filtered_df[group_var].unique()\n\n    combined = None\n\n    for i, g in enumerate(groups):\n\n        group_data = filtered_df[filtered_df[group_var] == g]\n\n        group_data = group_data.copy()\n\n        # Introduce jitter to reduce overlapping points\n        group_data[x_var] += np.random.uniform(-0.5, 0.5, size=len(group_data))\n        group_data[y_var] += np.random.uniform(-0.5, 0.5, size=len(group_data))\n\n        # Create scatter plot for this group with transparency\n        scatter = group_data.hvplot.scatter(\n            x=x_var,\n            y=y_var,\n            alpha=0.6,\n            label=str(g),\n            size=5\n        )\n\n        # Combine with previous groups\n        if combined is None:\n            combined = scatter\n        else:\n            combined = combined * scatter\n\n    # Add options to the combined plot\n    plot = combined.opts(\n        width=600,\n        height=400,\n        title=f'Relationship between {x_var} and {y_var}\\n(grouped by {group_var})',\n        tools=['hover', 'box_zoom', 'reset'],\n        show_grid=True,\n        toolbar='above'\n    )\n\n    return plot\n\nscatter_layout = pn.Column(\n    pn.pane.Markdown("### Interactive Scartterplot (Demo Only, Do Not Click)"), \n    select_var, select_group, slider, filter_select,\n    pn.panel(create_scatter),  \n    sizing_mode="stretch_both"\n)\n\n\n# Build a Tabbed Dashboard by Combining All Visualizations\npn.extension()\n\ndef create_dashboard(widgets, plots):\n    # Extract widgets\n    select_var, select_group, slider, filter_select = widgets\n\n    # Create separate control layouts for each tab\n    # General Tab: Only select_group and slider\n    general_controls = pn.Column(\n        select_group,\n        slider,\n        sizing_mode="stretch_width"\n    )\n\n    # Distributions and Correlations Tabs: All widgets\n    other_controls = pn.Column(\n        *widgets,  # Include all widgets\n        sizing_mode="stretch_width"\n    )\n    \n    # Create specific widgets for barchart_rank\n    barchart_rank_controls = pn.Column(\n        select_var,  # Widget for selecting variable for barchart_rank\n        slider,      # Slider for barchart_rank\n        sizing_mode="stretch_width"\n    )\n\n    # Create tabs\n    tabs = pn.Tabs(\n        ('Basic', pn.Column(\n            general_controls,  # Only select_group and slider\n            pn.Row(plots['barchart'], sizing_mode='stretch_both'),\n            sizing_mode='stretch_both'\n        )),\n        ('Ranking', pn.Column(\n            barchart_rank_controls,  # Only select_group and slider\n            pn.Row(plots['barchart_rank'], sizing_mode='stretch_both'),\n            sizing_mode='stretch_both'\n        )),\n        ('Distribution', pn.Column(\n            other_controls,  # All widgets\n            pn.Row(plots['boxplot'], plots['histogram'], sizing_mode='stretch_both'),\n            sizing_mode='stretch_both'\n        )),\n        ('Correlation', pn.Row(\n            other_controls,  # All widgets\n            plots['scatter'],\n            sizing_mode='stretch_both'\n        )),\n        ('Statistics', pn.Column(\n            # No widgets for stats tab\n            plots['stats'],\n            sizing_mode='stretch_both'\n        )),\n        sizing_mode='stretch_both'\n    )\n\n    main_layout = pn.Column(tabs, sizing_mode='stretch_both').servable()\n\n    template = pn.template.VanillaTemplate(\n        title="Interactive EDA Dashboard",\n        sidebar=[],\n        main=[main_layout],\n    )\n\n    return template\n\n# Initialize and display the dashboard\ndashboard = create_dashboard(\n    widgets=[select_var, select_group, slider, filter_select],\n    plots={\n        'barchart': barchart,\n        'barchart_rank': barchart_rank,\n        'histogram': histogram_plot,\n        'boxplot': box_plot,\n        'scatter': create_scatter,\n        'stats': pd.DataFrame(data_summary)\n    }\n)\n\ndashboard.servable()\n\nawait write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    from panel.io.pyodide import _convert_json_patch
    state.curdoc.apply_json_patch(_convert_json_patch(patch), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()