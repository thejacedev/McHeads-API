// MIT License
//
// Copyright (c) 2026 Jace Sleeman
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Official Mojang MHF_* accounts, keyed by UUID.
const MHF_HEADS = {
    "c06f89064c8a49119c29ea1dbd1aab82": "MHF_Steve",
    "6ab4317889fd490597f60f67d9d76fd9": "MHF_Alex",
    "057b1c4713214863a6fe8887f9ec265f": "MHF_Creeper",
    "daca2c3d719b41f5b624e4039e6c04bd": "MHF_Zombie",
    "a3f427a818c549c5a4fb64c6e0e1e0a8": "MHF_Skeleton",
    "5ad55f3441b64bd29c3218983c635936": "MHF_Spider",
    "40ffb37212f64678b3f22176bf56dd4b": "MHF_Enderman",
    "870aba9340e848b389c532ece00d6630": "MHF_Slime",
    "063085a6797f4785be1a21cd7580f752": "MHF_Ghast",
    "4c38ed11596a4fd4ab1d26f386c1cbac": "MHF_Blaze",
    "8b57078bf1bd45df83c4d88d16768fbe": "MHF_Pig",
    "f159b274c22e4340b7c152abde147713": "MHF_Cow",
    "92deafa9430742d9b00388601598d6c0": "MHF_Chicken",
    "dfaad5514e7e45a1a6f7c6fc5ec823ac": "MHF_Sheep",
    "72e64683e3134c36a408c66b64e94af5": "MHF_Squid",
    "bd482739767c45dca1f8c33c40530952": "MHF_Villager",
    "757f90b223444b8d8dac824232e2cece": "MHF_Golem",
    "1bee9df54f7142a2bf52d97970d3fea3": "MHF_Ocelot",
    "9586e5ab157a4658ad80b07552a9ca63": "MHF_Herobrine",
    "0972bdd14b8649fb9ecca353f8491a51": "MHF_LavaSlime",
    "b48a45553d4c464282338ec6ed7b368c": "MHF_Mooshroom",
    "cab28771f0cd4fe7b12902c69eba79a5": "MHF_CaveSpider",
    "8d2d1d6d80344c89bd86809a31fd5193": "MHF_Wolf",
    "fef85c492fdf47f89132552046243223": "MHF_Witch"
};

function getMHFHeads() {
    return MHF_HEADS;
}

module.exports = {
    MHF_HEADS,
    getMHFHeads
};
