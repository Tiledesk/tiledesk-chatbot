#npm version patch
version=`node -e 'console.log(require("./package.json").version)'`
echo "version $version"

npm i

if [ "$version" != "" ]; then
    git tag -a "$version" -m "`git log -1 --format=%s`"
    echo "Created a new tag, $version"
    git push --tags
    npm publish --access public
fi