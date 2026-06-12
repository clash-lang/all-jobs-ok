# SPDX-FileCopyrightText: 2026 QBayLogic B.V.
#
# SPDX-License-Identifier: BSD-2-Clause
{
  description = "Development environment for the all-ok GitHub Action";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
  };

  outputs =
    { nixpkgs, ... }:
    let
      forEachSystem =
        f:
        nixpkgs.lib.genAttrs [
          "x86_64-linux"
          "aarch64-linux"
          "x86_64-darwin"
          "aarch64-darwin"
        ] (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_20
            pkgs.reuse
          ];
        };
      });
    };
}
