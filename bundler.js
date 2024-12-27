const fs = require("fs");
const parser = require("@babel/parser");
const path = require("path");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

let ID = 0;

function createAsset(filename) {
    const content = fs.readFileSync(filename, "utf-8");
    const ast = parser.parse(content, { sourceType: "module" });
    const dependencies = [];
    traverse(ast, {
        ImportDeclaration({ node }) {
            dependencies.push(node.source.value);
        },
    });
    const id = ID++;
    const { code } = babel.transformFromAstSync(ast, null, {
        presets: ["@babel/preset-env"],
    });
    return {
        id,
        filename,
        dependencies,
        code,
    };
}

function createGraph(entry) {
    const mainAsset = createAsset(entry);
    const queue = [mainAsset];

    for (const asset of queue) {
        asset.mapping = {};
        const dirname = path.dirname(asset.filename);
        asset.dependencies.forEach((relativePathName) => {
            const absolutePath = path.join(dirname, relativePathName);
            const child = createAsset(absolutePath);
            asset.mapping[relativePathName] = child.id;
            queue.push(child);
        });
    }
    return queue;
}

function bundle(graph) {
    let modules = "";
    graph.forEach((mod) => {
        modules += `
            ${mod.id}: [
                function(require, module, exports) {
                    ${mod.code}
                },
                ${JSON.stringify(mod.mapping)}
            ],
        `;
    });

    const result = `
        (function(modules) {
            function require(id) {
                const [fn, mapping] = modules[id];

                function localRequire(relativePath) {
                    return require(mapping[relativePath]);
                }

                const module = { exports: {} };

                fn(localRequire, module, module.exports);

                return module.exports;
            }

            require(0);
        })({${modules}})
    `;
    return result;
}

const PATH = "./example/entry.js";
const graph = createGraph(PATH);
console.log(bundle(graph));
