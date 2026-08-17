import wardrobeOptions from "../shared/wardrobe-options.json";

export const subtypeOptions = wardrobeOptions.subtypes;
export const colorOptionGroups = wardrobeOptions.colorGroups;
export const colorOptions = colorOptionGroups.flatMap((group) => group.options);
