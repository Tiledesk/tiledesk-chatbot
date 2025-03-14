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

## Push commit to git
git add .
git commit -m "version added: ### $version"
git push tiledesk-chatbot "$current_branch"

## Create tag and npm 
if [ "$version" != "" ]; then
    git tag -a "$version" -m "`git log -1 --format=%s`"
    echo "Created a new tag, $version"
    git push --tags
    cd ./tybotRoute
    npm publish --access public
fi


echo "*********************************************************"
echo "    Deployed: @tiledesk/tiledesk-tybot-connector:$version_server"
echo "          Tagged: tiledesk/tiledesk-chatbot:$version"
echo "*********************************************************"