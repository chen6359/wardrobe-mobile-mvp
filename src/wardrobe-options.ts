import wardrobeOptions from "../shared/wardrobe-options.json";

export const subtypeOptions = wardrobeOptions.subtypes;
export const colorOptionGroups = wardrobeOptions.colorGroups;
export const colorOptions = colorOptionGroups.flatMap((group) => group.options);
export const materialOptionGroups = wardrobeOptions.materialGroups;
export const materialOptions = materialOptionGroups.flatMap((group) => group.options);
export const patternOptionGroups = wardrobeOptions.patternGroups;
export const patternOptions = patternOptionGroups.flatMap((group) => group.options);
