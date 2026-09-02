# Node 22, the version .github/workflows/test.yaml and local development run
# the suite on. This image was node:18-bullseye, so the runtime that shipped
# was never the runtime the 1398 tests were validated against.
FROM node:22-bookworm-slim

# Create app directory
WORKDIR /usr/src/app

ARG NPM_TOKEN

# A wildcard is used to ensure both package.json AND package-lock.json are
# copied where available (npm@5+)
COPY package*.json ./

# Install app dependencies.
#   * `npm ci` installs exactly what package-lock.json pins, so two builds of
#     the same commit produce the same tree -- `npm install` did not.
#   * `--omit=dev` leaves mocha/c8 out of the image.
#   * the private-registry token, when one is passed as a build arg, is written
#     and deleted inside a SINGLE layer, so it never ends up in the image.
# The previous form of this block (`RUN if ...; then RUN COPY .npmrc_ .npmrc`)
# was not valid shell and failed the build whenever NPM_TOKEN was set.
RUN if [ -n "$NPM_TOKEN" ]; then \
      printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > .npmrc; \
    fi; \
    npm ci --omit=dev; \
    rm -f .npmrc; \
    npm cache clean --force

# Bundle app source. .dockerignore is what keeps this COPY from pasting the
# HOST's node_modules (devDependencies included, and native modules built for
# the host OS) over the tree npm ci just installed.
COPY . .

EXPOSE 3000

CMD [ "npm", "start" ]
