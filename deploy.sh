#npm version patch
version=`node -e 'console.log(require("./package.json").version)'`
echo "version $version"

## Update package-lock.json
npm install

## Push commit to git
git add .
git commit -m "version added: ### $version"
git push remote master

## Create tag and npm 
if [ "$version" != "" ]; then
    git tag -a "$version" -m "`git log -1 --format=%s`"
    echo "Created a new tag, $version"
    git push --tags
    cd ./tybotRoute
    npm publish --access public
fi