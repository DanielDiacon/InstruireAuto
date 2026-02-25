import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import {
   buildMonthRange,
   filterReservationsAllPages,
} from "../api/reservationsService";

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
               const items = await filterReservationsAllPages(
                  {
                     ...(extraFilters || {}),
                     scope: "all",
                     sortBy: "startTime",
                     sortOrder: "asc",
                     ...range,
                  },
                  { pageSize: 500, maxItems: 15000 },
               );
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
