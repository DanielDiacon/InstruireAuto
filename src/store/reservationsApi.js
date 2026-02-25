import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { buildMonthRange, filterReservations } from "../api/reservationsService";

function normalizeItemsFromResponse(res) {
   if (Array.isArray(res)) return res;
   if (!res || typeof res !== "object") return [];

   const candidates = [
      res.items,
      res.data,
      res.results,
      res.rows,
      res.reservations,
      res.list,
   ];

   for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === "object") {
         if (Array.isArray(candidate.items)) return candidate.items;
         if (Array.isArray(candidate.data)) return candidate.data;
         if (Array.isArray(candidate.results)) return candidate.results;
         if (Array.isArray(candidate.rows)) return candidate.rows;
         if (Array.isArray(candidate.reservations)) return candidate.reservations;
         if (Array.isArray(candidate.list)) return candidate.list;
      }
   }

   return [];
}

function stableSerialize(value) {
   if (value === null || value === undefined) return "";
   if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
   if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      return `{${keys
         .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
         .join(",")}}`;
   }
   return JSON.stringify(value);
}

function monthKeyFromDateLike(dateLike) {
   const d = dateLike ? new Date(dateLike) : new Date();
   if (Number.isNaN(d.getTime())) return "invalid";
   return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const reservationsApi = createApi({
   reducerPath: "reservationsApi",
   baseQuery: fakeBaseQuery(),
   tagTypes: ["ReservationsMonth"],
   endpoints: (builder) => ({
      getReservationsForMonth: builder.query({
         async queryFn({ date, extraFilters } = {}) {
            try {
               const range = buildMonthRange(date);
               const response = await filterReservations({
                  ...(extraFilters || {}),
                  scope: "all",
                  ...range,
               });
               const items = normalizeItemsFromResponse(response);
               return { data: { items, range } };
            } catch (error) {
               return {
                  error: {
                     status: "CUSTOM_ERROR",
                     error:
                        error?.message ||
                        "Nu am putut încărca rezervările pentru luna selectată.",
                  },
               };
            }
         },
         serializeQueryArgs({ endpointName, queryArgs }) {
            const monthKey = monthKeyFromDateLike(queryArgs?.date);
            const filtersKey = stableSerialize(queryArgs?.extraFilters || {});
            return `${endpointName}|${monthKey}|${filtersKey}`;
         },
         providesTags(_result, _error, arg) {
            return [{ type: "ReservationsMonth", id: monthKeyFromDateLike(arg?.date) }];
         },
         keepUnusedDataFor: 300,
      }),
   }),
});

export const { useGetReservationsForMonthQuery } = reservationsApi;
