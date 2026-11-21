/* eslint-disable no-useless-escape -- \i is Vencord's identifier token in patch regexes */

import { describe, expect, it } from "vitest";

import { patchManifest } from "../patches";
import { runPatchFixture } from "../foundation/core/patches";

describe("Questcord patch manifest", () => {
    it("emits the four original Vencord patches without manifest metadata", () => {
        const patches = patchManifest.toVencordPatches("Questcord") as any[];
        expect(patches).toHaveLength(4);

        for (const patch of patches) {
            expect(patch.plugin).toBe("Questcord");
            expect(Object.keys(patch)).not.toContain("id");
            expect(Object.keys(patch)).not.toContain("description");
            expect(Object.keys(patch)).not.toContain("module");
            expect(Object.keys(patch)).not.toContain("expectations");
            expect(Object.keys(patch)).not.toContain("noWarnReason");
        }

        expect(patches[0].find).toBe(".QUEST_HOME_TILE_FOOTER,analyticsCtxQuestContent");
        expect(patches[0].noWarn).toBeUndefined();
        expect(patches[0].replacement.match.source).toBe(
            /function (\i)\((\i)\)\{(let\{quest:\i,questContent:\i,contentPosition:\i,rowIndex:\i,sourceQuestContent:\i\}=\i,\{shorterHeight:\i\}=\i\.useContext\(\i\.f\),\i=\(0,\i\.\i\)\(\i\),\{isQuestEnrollmentBlocked:\i\}=\(0,\i\.\i\)\(\[\i\.\i\])/
                .source
        );
        expect(patches[0].replacement.replace).toBe(
            "function $1($2){return $self.renderFooter($2,$1Original)}function $1Original($2){$3"
        );

        expect(patches[1].find).toEqual(/\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\)\]/);
        expect(patches[1].noWarn).toBeUndefined();
        expect(patches[1].replacement.match).toEqual(
            /(\(0,\i\.jsx\)\(\i,\{onChange:\i,selectedFilters:\i\}\))\]/
        );
        expect(patches[1].replacement.replace).toBe("$1,$self.renderQueueButton()]");

        expect(patches[2].find).toBe(".QUEST_HOME_TILE_V2_FOOTER,analyticsCtxQuestContent");
        expect(patches[2].noWarn).toBe(true);
        expect(patches[2].replacement.match.source).toBe(
            /(!\i&&!\i&&\(0,\i\.jsx\)\(\i\.\i,\{quest:(\i),surface:\i\.\i\.QUEST_HOME_TILE_V2_FOOTER,[^}]+\}\)),/
                .source
        );
        expect(patches[2].replacement.replace).toBe("$1,$self.renderQuestButton($2),");

        expect(patches[3].find).toBe(".QUEST_HOME_TILE_FOOTER");
        expect(patches[3].noWarn).toBe(true);
        expect(patches[3].replacement.match.source).toBe(
            /(\(0,\i\.jsx\)\(\i\.\i,\{quest:(\i),surface:\i\.\i\.QUEST_HOME_TILE_FOOTER,[^}]+\}\)),/
                .source
        );
        expect(patches[3].replacement.replace).toBe("$1,$self.renderQuestButton($2),");
    });

    it("matches and transforms the v1 quest tile footer fixture", () => {
        const source = `const marker="QUEST_HOME_TILE_FOOTER,analyticsCtxQuestContent";
function Footer(props){let{quest:q,questContent:qc,contentPosition:cp,rowIndex:ri,sourceQuestContent:sqc}=a,{shorterHeight:sh}=b.useContext(c.f),d=(0,e.f)(f),{isQuestEnrollmentBlocked:blocked}=(0,g.h)([h.i]);return null;}`;
        const expectedOutput = `const marker="QUEST_HOME_TILE_FOOTER,analyticsCtxQuestContent";
function Footer(props){return Questcord.renderFooter(props,FooterOriginal)}function FooterOriginal(props){let{quest:q,questContent:qc,contentPosition:cp,rowIndex:ri,sourceQuestContent:sqc}=a,{shorterHeight:sh}=b.useContext(c.f),d=(0,e.f)(f),{isQuestEnrollmentBlocked:blocked}=(0,g.h)([h.i]);return null;}`;

        const result = runPatchFixture(patchManifest.entries[0], {
            name: "v1 quest tile footer",
            source,
            expectedOutput,
            options: { pluginPath: "Questcord" },
        });

        expect(result.ok, result.issues.join("; ")).toBe(true);
        expect(result.findMatches).toBe(1);
        expect(result.replacementMatches).toEqual([1]);
        expect(result.output).toBe(expectedOutput);
    });

    it("matches and transforms the quest filter fixture", () => {
        const source = `const pills=[(0,a.jsx)(b,{onChange:onChange,selectedFilters:filters})];`;
        const expectedOutput = `const pills=[(0,a.jsx)(b,{onChange:onChange,selectedFilters:filters}),Questcord.renderQueueButton()];`;

        const result = runPatchFixture(patchManifest.entries[1], {
            name: "quest filter pills",
            source,
            expectedOutput,
            options: { pluginPath: "Questcord" },
        });

        expect(result.ok, result.issues.join("; ")).toBe(true);
        expect(result.findMatches).toBe(1);
        expect(result.replacementMatches).toEqual([1]);
        expect(result.output).toBe(expectedOutput);
    });

    it("matches and transforms the v2 quest tile fixture", () => {
        const source = `const surface=".QUEST_HOME_TILE_V2_FOOTER,analyticsCtxQuestContent";
if(!a&&!b&&(0,c.jsx)(d.e,{quest:quest,surface:f.g.QUEST_HOME_TILE_V2_FOOTER,foo:1}),next){}`;
        const expectedOutput = `const surface=".QUEST_HOME_TILE_V2_FOOTER,analyticsCtxQuestContent";
if(!a&&!b&&(0,c.jsx)(d.e,{quest:quest,surface:f.g.QUEST_HOME_TILE_V2_FOOTER,foo:1}),Questcord.renderQuestButton(quest),next){}`;

        const result = runPatchFixture(patchManifest.entries[2], {
            name: "v2 quest tile footer",
            source,
            expectedOutput,
            options: { pluginPath: "Questcord" },
        });

        expect(result.ok, result.issues.join("; ")).toBe(true);
        expect(result.findMatches).toBe(1);
        expect(result.replacementMatches).toEqual([1]);
        expect(result.output).toBe(expectedOutput);
    });

    it("matches and transforms the generic quest tile fixture", () => {
        const source = `const surface=".QUEST_HOME_TILE_FOOTER";
const nodes=[(0,c.jsx)(d.e,{quest:q,surface:s.g.QUEST_HOME_TILE_FOOTER,foo:1}),other];`;
        const expectedOutput = `const surface=".QUEST_HOME_TILE_FOOTER";
const nodes=[(0,c.jsx)(d.e,{quest:q,surface:s.g.QUEST_HOME_TILE_FOOTER,foo:1}),Questcord.renderQuestButton(q),other];`;

        const result = runPatchFixture(patchManifest.entries[3], {
            name: "generic quest tile footer",
            source,
            expectedOutput,
            options: { pluginPath: "Questcord" },
        });

        expect(result.ok, result.issues.join("; ")).toBe(true);
        expect(result.findMatches).toBe(2);
        expect(result.replacementMatches).toEqual([1]);
        expect(result.output).toBe(expectedOutput);
    });
});
