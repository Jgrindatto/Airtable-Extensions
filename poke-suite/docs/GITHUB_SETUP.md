# Put Poké Suite on GitHub

Keep both apps in one repository: `apps/poke-kanban` and `apps/poke-mart`. They keep separate dependency lockfiles and Airtable extension configuration while sharing documentation and root check commands.

## Prepare the folder

Extract the cleaned ZIP and open a terminal in the `poke-suite` directory. With Node.js 24 available, run:

```sh
npm run setup
npm run check
```

These checks need npm registry access. Live behavior and table permissions still need verification in Airtable; see [Airtable setup](AIRTABLE_SETUP.md).

The ignore rules exclude installed dependencies, generated output, environment files, and personal Airtable configuration. Commit both `package-lock.json` files. The `private` flag in `package.json` prevents accidental npm publication; it does **not** determine GitHub repository visibility.

## Create an empty repository

Create a repository in your GitHub account with the name and **public or private visibility you choose**. Leave GitHub's README, `.gitignore`, and license initialization options unchecked so the remote is empty. This folder already supplies documentation and ignore rules. No license has been selected for you; choose one separately if you want to grant reuse rights.

See GitHub's [instructions for adding locally hosted code](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## Push the prepared source

Replace `YOUR_USERNAME` and `YOUR_REPOSITORY` with your repository's values. From the extracted repository root:

```sh
git init -b main
git add .
git diff --cached --stat
git diff --cached
git commit -m "Initial Poké Suite source"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Review the staged files before committing, then authenticate with your own GitHub credentials when Git requests it. If you already initialized this folder, use its existing Git history and remote rather than rerunning initialization. An existing remote with commits needs a clone/merge workflow instead of this empty-repository sequence.

After the push, confirm both app folders and the documentation appear on GitHub. A push saves source code; it does not update the Airtable interface elements. Publish or update those through your existing Airtable workflow when ready.

No repository has been created and no source has been pushed by this cleanup.
