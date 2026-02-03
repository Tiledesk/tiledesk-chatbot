# Load .env variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check if the token is set
if [ -z "$NPM_PUBLISH_TOKEN" ]; then
  echo "⚠️ Missing NPM_PUBLISH_TOKEN in environment."
  echo "You can speed up the process by setting the environment variable with your publish token."
  read -p "Do you want to continue with manual login? (y/n): " choice
  if [[ "$choice" != "y" && "$choice" != "Y" ]]; then
    echo "❌ Deploy aborted."
    exit 1
  else
    echo "💡 Proceed with 'npm login' manually..."
    npm login
  fi
else
  # Create temporary .npmrc with the token
  echo "//registry.npmjs.org/:_authToken=${NPM_PUBLISH_TOKEN}" > ~/.npmrc
fi

#npm version patch
version=`node -e 'console.log(require("./package.json").version)'`
version_server=`node -e 'console.log(require("./tybotRoute/package.json").version)'`
echo "version $version"

## Update package-lock.json
npm install

## Update tybotRoute/package-lock.json
cd ./tybotRoute
npm install

cd ..

# Get curent branch name
current_branch=$(git rev-parse --abbrev-ref HEAD)
remote_name=$(git config --get branch.$current_branch.remote)

## Push commit to git
git add .
git commit -m "version added: ### $version"
git push "$remote_name" "$current_branch"

## Create tag and npm 
if [ "$version" != "" ]; then
    git tag -a "$version" -m "`git log -1 --format=%s`"
    echo "Created a new tag, $version"
    git push --tags
    cd ./tybotRoute
    npm publish --access public
fi

echo "\n"
echo "*********************************************************"
echo "    Deployed: @tiledesk/tiledesk-tybot-connector:$version_server"
echo "          Tagged: tiledesk/tiledesk-chatbot:$version"
echo "*********************************************************"