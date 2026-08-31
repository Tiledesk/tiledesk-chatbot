# Phase 6b collapsed the two npm packages into one. There is no longer a
# separate `tybotRoute/package.json`, so `@tiledesk/tiledesk-tybot-connector`
# is NOT published to npm by this script any more. The npm auth block that used
# to exist here served only that publish step and was removed with it.
# This script now does what it always did for the app: refresh the lockfile,
# commit, tag and push. The image is built from the tag by the docker workflows.

#npm version patch
version=`node -e 'console.log(require("./package.json").version)'`
echo "version $version"

## Update package-lock.json (single, repo-root lockfile)
npm install

# Get curent branch name
current_branch=$(git rev-parse --abbrev-ref HEAD)
remote_name=$(git config --get branch.$current_branch.remote)

## Push commit to git
git add .
git commit -m "version added: ### $version"
git push "$remote_name" "$current_branch"

## Create tag
if [ "$version" != "" ]; then
    git tag -a "$version" -m "`git log -1 --format=%s`"
    echo "Created a new tag, $version"
    git push --tags
fi

echo "\n"
echo "*********************************************************"
echo "          Tagged: tiledesk/tiledesk-chatbot:$version"
echo "  NOTE: @tiledesk/tiledesk-tybot-connector is no longer"
echo "        published to npm (single-package collapse)."
echo "*********************************************************"
