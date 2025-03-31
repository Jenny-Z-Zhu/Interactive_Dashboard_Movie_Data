# Interactive Dashboard for Movie Data
This notebook is designed for creating an interactive and visually rich exploratory data analysis (EDA) dashboard. It utilizes libraries like Panel, HvPlot.

Web Version: https://jenny-z-zhu.github.io/Interactive_Dashboard_Movie_Data/app.html
* Due to file size, the web app might take too long to load, so the best way is to download .ipybn file and run locally.
    
Welcome! This project involves building an interactive data visualization dashboard using Panel and HvPlot. The dashboard allows users to explore, filter, and analyze data dynamically with interactive widgets like sliders, dropdowns, and checkboxes.

🔹 Key Features:
- Panel: For creating interactive web-based dashboards in Python.
- HvPlot: High-level plotting API for interactive visualizations with minimal code.
- Widgets: User-controlled filters for real-time data exploration.
- Deployment: Can be hosted locally or on web platforms like Binder, Heroku, or Hugging Face Spaces.
  
---
# Two Ways to View this Project
## View on Your Local Environment
Download below file to view dashboard on your local enviroment (IDE only), Jupyter Lab won't work.
- `Movie_EDA_JupyterNB.ipynb`
   
Steps:
1. Run below in a Jupyter code block:  
```python
!pip install panel hvplot pandas numpy vega_datasets
```
3. Delete above code block, restart kernel and re-run entire notebook. You should have a web app (e.g. http://localhost:46713) pop up in your brower.
4. Plots rendered in outputs are for demo only, the interactive widget won't work, it will show error if you click. The complete widget can be used in final app, which is on a web host: https://jenny-z-zhu.github.io/Interactive_Dashboard_Movie_Data/app.html

---
## View Demo Only (No Interactive Dashboard)
If you don't want to run on your local, download below files:
Demo of individual plot and its widgets, but the widget doesn't work on PDF: `Movie_EDA_PDF.pdf`
