# Virtual Environment Setup Guide

This guide explains how to install and use a Python virtual environment for this project.

## What is a Virtual Environment?

A virtual environment is an isolated Python environment that allows you to install packages specific to this project without affecting your system-wide Python installation.

## Prerequisites

- Python 3.7 or higher installed on your system
- pip (Python package installer)

## Installation Steps

### 1. Create Virtual Environment

The virtual environment has already been created in the `venv` folder. If you need to recreate it:

```powershell
python -m venv venv
```

### 2. Activate Virtual Environment

**On Windows (PowerShell):**

```powershell
.\venv\Scripts\Activate.ps1
```

**On Windows (Command Prompt):**

```cmd
venv\Scripts\activate.bat
```

**On macOS/Linux:**

```bash
source venv/bin/activate
```

After activation, you should see `(venv)` at the beginning of your command prompt.

### 3. Install Dependencies

Once the virtual environment is activated, install the required packages:

```powershell
pip install -r requirements.txt
```

This will install:

- Flask (web framework)
- Flask-CORS (Cross-Origin Resource Sharing support)
- OpenAI (Azure OpenAI API)
- python-dotenv (environment variable management)
- azure-cognitiveservices-speech (Azure Speech Services)

### 4. Configure Environment Variables

Create a `.env` file in the project root with your Azure credentials:

```
AZURE_SPEECH_KEY=your_speech_key_here
AZURE_SPEECH_REGION=your_region_here
AZURE_OPENAI_KEY=your_openai_key_here
AZURE_OPENAI_ENDPOINT=your_endpoint_here
```

### 5. Run the Application

With the virtual environment activated and dependencies installed:

```powershell
python server.py
```

Or simply use the batch file:

```powershell
.\start.bat
```

## Deactivating Virtual Environment

When you're done working on the project:

```powershell
deactivate
```

## Troubleshooting

### PowerShell Execution Policy Error

If you get an error about script execution being disabled, run PowerShell as Administrator and execute:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Virtual Environment Not Activating

Make sure you're in the project directory (`Learning` folder) when running the activation command.

### Package Installation Fails

Ensure pip is up to date:

```powershell
python -m pip install --upgrade pip
```

## Verifying Installation

To check if packages are installed correctly:

```powershell
pip list
```

You should see all the packages from `requirements.txt` listed.

## Notes

- Always activate the virtual environment before working on this project
- The `venv` folder should NOT be committed to version control (add to `.gitignore`)
- Each time you open a new terminal, you need to reactivate the virtual environment
